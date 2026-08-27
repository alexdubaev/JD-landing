import assert from "node:assert/strict";
import test from "node:test";

import { createDaemon, runShadowBatch } from "../src/worker.mjs";

const products = (count) =>
  Array.from({ length: count }, (_, index) => ({
    id: `p-${index + 1}`,
    status: "published",
    slug: `item-${index + 1}`,
    title: `Item ${index + 1}`,
    seo_title: "",
    seo_description: "",
  }));

const shadowConfig = {
  enabled: true,
  mode: "shadow",
  maxUrlsPerRun: 10,
  maxWorkItemsPerRun: 10,
};

test("shadow batch survives per-item upsert failures", async () => {
  const logged = [];
  const originalError = console.error;
  console.error = (message) => logged.push(String(message));
  try {
    const client = {
      getFactoryInputs: async () => ({ products: products(3), categories: [], pages: [] }),
      upsertFactoryWorkItem: async (item) => {
        if (item.url?.endsWith("/item-2")) throw new Error("directus 500");
        return item;
      },
    };

    const result = await runShadowBatch({ client, config: shadowConfig });

    assert.equal(result.status, "completed");
    assert.equal(result.createdOrUpdated, 2);
    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0].item, /item-2/u);
    assert.match(result.failures[0].error, /directus 500/u);
    assert.equal(logged.filter((line) => line.includes("shadow_batch_item_failures")).length, 1);
  } finally {
    console.error = originalError;
  }
});

test("shadow batch still rejects when the input fetch itself fails", async () => {
  const client = {
    getFactoryInputs: async () => {
      throw new Error("timeout");
    },
    upsertFactoryWorkItem: async () => {
      throw new Error("must not be called");
    },
  };

  await assert.rejects(
    runShadowBatch({ client, config: shadowConfig }),
    /timeout/u,
  );
});

test("daemon logs a rejected tick and keeps the process alive", async () => {
  const logged = [];
  let ticks = 0;
  const daemon = createDaemon({
    task: async () => {
      ticks += 1;
      throw new Error("directus down");
    },
    intervalMs: 5,
    runOnStart: true,
    logger: { error: (message) => logged.push(String(message)) },
  });

  daemon.start();
  await new Promise((resolve) => setTimeout(resolve, 25));
  daemon.stop();

  assert.ok(ticks >= 2, `expected repeated ticks, got ${ticks}`);
  assert.equal(logged.filter((line) => line.includes("tick_failed")).length, ticks);
  assert.ok(logged.every((line) => line.includes("directus down")));
});

test("daemon can start interval-only without an immediate tick", async () => {
  let immediateTicks = 0;
  const daemon = createDaemon({
    task: async () => {
      immediateTicks += 1;
    },
    intervalMs: 5,
    runOnStart: false,
    logger: { error: () => {} },
  });

  daemon.start();
  // Give an immediate tick (if one happened anyway) time to land.
  await new Promise((resolve) => setTimeout(resolve, 1));
  const beforeInterval = immediateTicks;
  await new Promise((resolve) => setTimeout(resolve, 15));
  daemon.stop();

  assert.equal(beforeInterval, 0, "no tick may run before the first interval");
  assert.ok(immediateTicks >= 1, "interval ticks ran");
});
