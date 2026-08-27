import { createSeoFactoryConfig } from "./config.mjs";
import { buildShadowWorkItems } from "./planner.mjs";

export async function runShadowBatch({ client, config = createSeoFactoryConfig(process.env) }) {
  if (!config.enabled) {
    return { status: "skipped", reason: "SEO_FACTORY_ENABLED=false", createdOrUpdated: 0, workItems: [] };
  }
  const input = await client.getFactoryInputs({ limit: config.maxUrlsPerRun });
  const workItems = buildShadowWorkItems(input).slice(0, config.maxWorkItemsPerRun);
  const persisted = [];
  const failures = [];
  // One bad work item (Directus 5xx/timeout) must not discard the rest of
  // the batch: capture it, keep going, report a summary.
  for (const item of workItems) {
    try {
      persisted.push(await client.upsertFactoryWorkItem(item));
    } catch (error) {
      failures.push({ item: item.url ?? item.entity_key ?? item.dedupe_key, error: error?.message ?? String(error) });
    }
  }
  if (failures.length > 0) {
    console.error(JSON.stringify({
      service: "seo-worker",
      event: "shadow_batch_item_failures",
      failed: failures.length,
      ok: persisted.length,
      failures,
    }));
  }
  return { status: "completed", mode: "shadow", createdOrUpdated: persisted.length, workItems: persisted, failures };
}

export function createNonOverlappingScheduler(task) {
  let running = false;
  return {
    tick() {
      if (running) return false;
      running = true;
      return Promise.resolve()
        .then(task)
        .finally(() => { running = false; });
    },
    get running() { return running; },
  };
}

/**
 * Daemon wiring around the scheduler. Every tick failure (rejected task,
 * rejected batch fetch) is logged instead of escaping: an unhandled
 * rejection kills the Node process, turning a transient Directus outage
 * into a silent crash/restart loop. `start()` sets the interval and ticks
 * immediately when `runOnStart` is true; `stop()` clears the timer (tests).
 */
export function createDaemon({ task, intervalMs, runOnStart = true, logger = console }) {
  const scheduler = createNonOverlappingScheduler(task);
  const tickSafely = () => {
    scheduler.tick().catch((error) => {
      logger.error(JSON.stringify({
        service: "seo-worker",
        event: "tick_failed",
        error: error?.message ?? String(error),
      }));
    });
    return true;
  };
  const daemon = {
    scheduler,
    tickSafely,
    _timer: undefined,
    start() {
      if (runOnStart) tickSafely();
      daemon._timer = setInterval(tickSafely, intervalMs);
      return daemon;
    },
    stop() {
      if (daemon._timer !== undefined) clearInterval(daemon._timer);
      daemon._timer = undefined;
    },
  };
  return daemon;
}
