import { createSeoFactoryConfig } from "./config.mjs";
import { buildShadowWorkItems } from "./planner.mjs";

export async function runShadowBatch({ client, config = createSeoFactoryConfig(process.env) }) {
  if (!config.enabled) {
    return { status: "skipped", reason: "SEO_FACTORY_ENABLED=false", createdOrUpdated: 0, workItems: [] };
  }
  const input = await client.getFactoryInputs({ limit: config.maxUrlsPerRun });
  const workItems = buildShadowWorkItems(input).slice(0, config.maxWorkItemsPerRun);
  const persisted = [];
  for (const item of workItems) persisted.push(await client.upsertFactoryWorkItem(item));
  return { status: "completed", mode: "shadow", createdOrUpdated: persisted.length, workItems: persisted };
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
