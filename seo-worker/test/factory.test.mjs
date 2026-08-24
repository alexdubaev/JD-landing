import assert from "node:assert/strict";
import test from "node:test";

import { createSeoFactoryConfig } from "../src/config.mjs";
import {
  buildShadowWorkItems,
  escapeHtml,
  renderDraftHtml,
} from "../src/planner.mjs";
import { createDirectusClient } from "../src/directus-client.mjs";
import { createNonOverlappingScheduler, runShadowBatch } from "../src/worker.mjs";

test("defaults to disabled shadow mode and can never publish", () => {
  const config = createSeoFactoryConfig({ SEO_FACTORY_ALLOW_PUBLISH: "true" });
  assert.equal(config.enabled, false);
  assert.equal(config.mode, "shadow");
  assert.equal(config.productionSchedule, false);
  assert.equal(config.allowApply, false);
  assert.equal(config.allowPublish, false);
});

test("published Directus input produces deterministic work items without catalog writes", () => {
  const input = {
    products: [
      { id: "p-1", status: "published", slug: "filter", title: "Filter", seo_title: "", seo_description: "" },
      { id: "p-2", status: "draft", slug: "draft", title: "Draft", seo_title: "", seo_description: "" },
    ],
    categories: [{ id: "c-1", status: "published", slug: "filters", title: "Filters", seo_title: "", seo_description: "" }],
    pages: [{ id: "page-1", status: "published", slug: "delivery", title: "Delivery", seo_title: "", seo_description: "" }],
  };
  const first = buildShadowWorkItems(input);
  const second = buildShadowWorkItems(input);
  assert.deepEqual(first, second);
  assert.equal(first.length, 3);
  assert.ok(first.every((item) => item.status === "ready"));
  assert.ok(first.every((item) => item.dedupe_key));
  assert.ok(first.every((item) => !("price" in item) && !("patch_json" in item)));
});

test("hostile titles and outlines serialize as escaped text, not executable HTML", () => {
  const hostile = "<img src=x onerror=alert(1)> & \"quoted\"";
  assert.equal(escapeHtml(hostile), "&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quoted&quot;");
  const html = renderDraftHtml({ title: hostile, sections: [{ heading: hostile, body: hostile }] });
  assert.doesNotMatch(html, /<(?:img|script)\b/iu);
  assert.match(html, /&lt;img/iu);
});

test("Directus requests carry an abort timeout signal", async () => {
  let captured;
  const client = createDirectusClient({
    baseUrl: "https://cms.example.test",
    token: "worker-token",
    runId: "run-timeout",
    timeoutMs: 1234,
    fetchImpl: async (_url, init) => {
      captured = init;
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    },
  });
  await client.getFactoryInputs({ limit: 5 });
  assert.ok(captured.signal instanceof AbortSignal);
});

test("shadow batch reads inputs and upserts recommendations through the factory endpoint", async () => {
  const requests = [];
  const responses = [
    { data: { products: [{ id: "9e84190b-1cc6-4b1a-9a2c-3d6c9c6a4c4e", status: "published", slug: "filter", title: "Filter", seo_title: "", seo_description: "" }], categories: [], pages: [] } },
    { data: { dedupe_key: "wi-1", status: "ready" } },
  ];
  const client = createDirectusClient({
    baseUrl: "https://cms.example.test",
    token: "worker-token",
    runId: "run-shadow",
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify(responses.shift()), { status: 200 });
    },
  });
  const result = await runShadowBatch({ client, config: createSeoFactoryConfig({ SEO_FACTORY_ENABLED: "true", SEO_WORKER_RUN_ID: "run-shadow" }) });
  assert.equal(result.createdOrUpdated, 1);
  assert.ok(requests.some(({ url, init }) => url.endsWith("/seo-factory/work-items/upsert") && init.method === "POST"));
  assert.ok(requests.every(({ url }) => !url.includes("/items/")));
});

test("approved workflow claims through atomic extension and creates a draft only", async () => {
  const requests = [];
  const responses = [
    { data: { id: "wi-1", type: "content", status: "processing", title: "Brief", proposed_value_json: { title: "Draft", sections: [] } } },
    { data: { id: "wi-1", status: "draft_created", article: "article-1" } },
  ];
  const client = createDirectusClient({
    baseUrl: "https://cms.example.test",
    token: "worker-token",
    runId: "run-approved",
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify(responses.shift()), { status: 200 });
    },
  });
  const result = await client.processApprovedDrafts({ limit: 1 });
  assert.equal(result[0].status, "draft_created");
  assert.match(requests[0].url, /seo-factory\/claim$/u);
  assert.match(requests[1].url, /seo-factory\/draft$/u);
  assert.equal(JSON.parse(requests[1].init.body).id, "wi-1");
  assert.ok(requests.every(({ url }) => !url.includes("/items/")));
  assert.doesNotMatch(JSON.stringify(requests), /"status":"published"/u);
});

test("failed draft creation releases the claim as retryable", async () => {
  const requests = [];
  const responses = [
    { data: { id: "wi-1", status: "processing", proposed_value_json: { title: "Draft", sections: [] } } },
    { errors: [{ message: "timeout" }] },
    { data: { id: "wi-1", status: "retryable" } },
  ];
  const client = createDirectusClient({
    baseUrl: "https://cms.example.test",
    token: "worker-token",
    runId: "run-retry",
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      const response = responses.shift();
      return new Response(JSON.stringify(response), { status: response.errors ? 504 : 200 });
    },
  });
  const result = await client.processApprovedDrafts({ limit: 1 });
  assert.equal(result[0].status, "retryable");
  assert.match(requests.at(-1).url, /seo-factory\/release$/u);
});

test("scheduler never overlaps ticks", async () => {
  let active = 0;
  let maxActive = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const scheduler = createNonOverlappingScheduler(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await gate;
    active -= 1;
  });
  const first = scheduler.tick();
  const second = scheduler.tick();
  assert.equal(second, false);
  release();
  await first;
  assert.equal(maxActive, 1);
});
