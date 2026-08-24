import assert from "node:assert/strict";
import test from "node:test";

import { createSeoFactoryConfig } from "../src/config.mjs";
import { createDirectusClient } from "../src/directus-client.mjs";
import { runShadowBatch } from "../src/worker.mjs";

const publishedProduct = {
  id: "9e84190b-1cc6-4b1a-9a2c-3d6c9c6a4c4e",
  status: "published",
  slug: "filter",
  title: "Filter",
  seo_title: "",
  seo_description: "",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify({ data }), { status });
}

test("shadow planning uses only the Core inputs and work-item upsert endpoints", async () => {
  const requests = [];
  const config = createSeoFactoryConfig({
    SEO_FACTORY_ENABLED: "true",
    SEO_WORKER_RUN_ID: "run-shadow-1",
    DIRECTUS_URL: "https://cms.example.test",
    SEO_WORKER_TOKEN: "worker-token",
  });
  const client = createDirectusClient(config, {
    fetchImpl: async (url, init) => {
      const parsedUrl = new URL(url);
      requests.push({ url: parsedUrl, init });
      if (parsedUrl.pathname === "/seo-factory/inputs") {
        return jsonResponse({ products: [publishedProduct], categories: [], pages: [] });
      }
      if (parsedUrl.pathname === "/items/products") return jsonResponse([publishedProduct]);
      if (["/items/categories", "/items/pages", "/items/seo_work_items"].includes(parsedUrl.pathname)) {
        return jsonResponse([]);
      }
      return jsonResponse({ id: "queued", dedupe_key: "queued", status: "ready" });
    },
  });

  const result = await runShadowBatch({ client, config });

  assert.equal(result.createdOrUpdated, 1);
  assert.deepEqual(
    requests.map(({ url, init }) => [init.method, url.pathname]),
    [
      ["POST", "/seo-factory/inputs"],
      ["POST", "/seo-factory/work-items/upsert"],
    ],
  );
  assert.deepEqual(JSON.parse(requests[0].init.body), { limit: 100 });
  assert.equal(requests[1].init.headers["x-seo-worker-run"], "run-shadow-1");
  assert.ok(requests.every(({ url }) => !url.pathname.startsWith("/items/")));
});

test("approved draft processing uses the atomic Core draft endpoint and no items route", async () => {
  const requests = [];
  const claimed = {
      id: "work-item-1",
      status: "processing",
      title: "Brief",
      proposed_value_json: {
        title: "Safe draft",
        excerpt: "Useful summary",
        sections: [{ heading: "Purpose", body: "Selection guidance" }],
      },
    };
  const client = createDirectusClient({
    baseUrl: "https://cms.example.test",
    token: "worker-token",
    runId: "run-draft-1",
  }, {
    fetchImpl: async (url, init) => {
      const parsedUrl = new URL(url);
      requests.push({ url: parsedUrl, init });
      if (parsedUrl.pathname === "/seo-factory/claim") return jsonResponse(claimed);
      if (parsedUrl.pathname === "/items/articles") return jsonResponse({ id: "article-1", status: "draft" });
      return jsonResponse({ id: "work-item-1", status: "draft_created", article: "article-1" });
    },
  });

  const result = await client.processApprovedDrafts({ limit: 1 });

  assert.deepEqual(result, [{
    status: "draft_created",
    itemId: "work-item-1",
    articleId: "article-1",
    workItem: { id: "work-item-1", status: "draft_created", article: "article-1" },
  }]);
  assert.deepEqual(
    requests.map(({ url, init }) => [init.method, url.pathname]),
    [
      ["POST", "/seo-factory/claim"],
      ["POST", "/seo-factory/draft"],
    ],
  );
  assert.deepEqual(JSON.parse(requests[1].init.body), {
    id: "work-item-1",
    title: "Safe draft",
    excerpt: "Useful summary",
    sections: [{ heading: "Purpose", body: "Selection guidance" }],
  });
  assert.ok(requests.every(({ url, init }) => (
    !url.pathname.startsWith("/items/")
      && init.headers["x-seo-worker-run"] === "run-draft-1"
  )));
});

test("failed Core draft creation releases the same claim with the bounded run header", async () => {
  const requests = [];
  const responses = [
    jsonResponse({ id: "work-item-1", status: "processing", proposed_value_json: { title: "Draft", sections: [] } }),
    new Response(JSON.stringify({ errors: [{ message: "temporary failure" }] }), { status: 503 }),
    jsonResponse({ id: "work-item-1", status: "retryable" }),
  ];
  const client = createDirectusClient({
    baseUrl: "https://cms.example.test",
    token: "worker-token",
    runId: "run-release-1",
  }, {
    fetchImpl: async (url, init) => {
      requests.push({ url: new URL(url), init });
      return responses.shift();
    },
  });

  const result = await client.processApprovedDrafts({ limit: 1 });

  assert.equal(result[0].status, "retryable");
  assert.deepEqual(
    requests.map(({ url, init }) => [init.method, url.pathname, init.headers["x-seo-worker-run"]]),
    [
      ["POST", "/seo-factory/claim", "run-release-1"],
      ["POST", "/seo-factory/draft", "run-release-1"],
      ["POST", "/seo-factory/release", "run-release-1"],
    ],
  );
  assert.ok(requests.every(({ url }) => !url.pathname.startsWith("/items/")));
});

test("factory configuration supplies a non-empty run id bounded for Core headers", () => {
  const supplied = createSeoFactoryConfig({ SEO_WORKER_RUN_ID: `  ${"x".repeat(200)}  ` });
  const generated = createSeoFactoryConfig({});

  assert.equal(supplied.runId, "x".repeat(128));
  assert.ok(generated.runId.length > 0 && generated.runId.length <= 128);
});

test("factory configuration replaces CRLF and Unicode run ids with unique ASCII header-safe ids", () => {
  const unsafeInputs = ["run-safe\r\nx-injected: yes", "запуск-1"];
  const replacements = unsafeInputs.map((SEO_WORKER_RUN_ID) => (
    createSeoFactoryConfig({ SEO_WORKER_RUN_ID }).runId
  ));
  const generated = [createSeoFactoryConfig({}).runId, createSeoFactoryConfig({}).runId];

  for (const runId of [...replacements, ...generated]) {
    assert.match(runId, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u);
  }
  assert.ok(replacements.every((runId) => runId.startsWith("run-")));
  assert.notEqual(generated[0], generated[1]);
});
