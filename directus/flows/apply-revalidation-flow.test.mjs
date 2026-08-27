import assert from "node:assert/strict";
import test from "node:test";

import {
  applyRevalidationFlow,
  buildRevalidationBlueprint,
} from "./apply-revalidation-flow.mjs";

const config = {
  url: "https://site.example.test/api/revalidate",
  secret: "test-secret-that-must-not-leak",
};

test("creates an active non-blocking event flow and request operation", async () => {
  const requests = [];
  const client = {
    async request(path, options = {}) {
      requests.push({ path, method: options.method ?? "GET", body: options.body });
      if (path.startsWith("/flows?")) return [];
      if (path === "/flows" && options.method === "POST") return { id: "flow-id" };
      if (path.startsWith("/operations?")) return [];
      if (path === "/operations" && options.method === "POST") return { id: "operation-id" };
      if (path === "/flows/flow-id" && options.method === "PATCH") return {};
      throw new Error(`Unexpected request: ${options.method ?? "GET"} ${path}`);
    },
  };

  const actions = await applyRevalidationFlow(client, config);
  const flowCreate = requests.find(({ path, method }) => path === "/flows" && method === "POST");
  const operationCreate = requests.find(
    ({ path, method }) => path === "/operations" && method === "POST",
  );
  const flow = JSON.parse(flowCreate.body);
  const operation = JSON.parse(operationCreate.body);

  assert.deepEqual(actions, [
    "create flow Ревалидация сайта",
    "create operation Обновить сайт",
    "connect flow operation",
  ]);
  assert.equal(flow.trigger, "event");
  assert.equal(flow.accountability, "$full");
  assert.deepEqual(flow.options.scope, ["items.create", "items.update", "items.delete"]);
  assert.ok(flow.options.collections.includes("home_page"));
  assert.ok(flow.options.collections.includes("page_sections"));
  assert.ok(flow.options.collections.includes("pages"));
  // FAQ edits and asset replacements must reach the webhook too: the route
  // maps them to the "faq"/"files" cache tags.
  assert.ok(flow.options.collections.includes("faq_items"));
  assert.ok(flow.options.collections.includes("directus_files"));
  assert.equal(operation.type, "request");
  assert.equal(operation.options.method, "POST");
  assert.deepEqual(operation.options.body, {
    collection: "{{$trigger.collection}}",
    id: "{{$trigger.keys[0]}}",
    newSlug: "{{$trigger.payload.slug}}",
  });
  assert.deepEqual(operation.options.headers, [
    { header: "x-revalidate-secret", value: config.secret },
  ]);
});

test("is idempotent when the managed flow and operation match", async () => {
  const blueprint = buildRevalidationBlueprint(config);
  const client = {
    async request(path) {
      if (path.startsWith("/flows?")) {
        return [{ id: "flow-id", ...blueprint.flow, operation: "operation-id" }];
      }
      if (path.startsWith("/operations?")) {
        return [{ id: "operation-id", flow: "flow-id", ...blueprint.operation }];
      }
      throw new Error(`Unexpected write: ${path}`);
    },
  };

  assert.deepEqual(await applyRevalidationFlow(client, config), []);
});

test("dry-run reports drift without writing or exposing the secret", async () => {
  const requests = [];
  const client = {
    async request(path, options = {}) {
      requests.push({ path, method: options.method ?? "GET" });
      if (path.startsWith("/flows?")) return [];
      throw new Error(`Unexpected write: ${path}`);
    },
  };

  const actions = await applyRevalidationFlow(client, config, { dryRun: true });
  assert.deepEqual(actions, [
    "create flow Ревалидация сайта",
    "create operation Обновить сайт",
    "connect flow operation",
  ]);
  assert.equal(JSON.stringify(actions).includes(config.secret), false);
  assert.deepEqual(requests.map(({ method }) => method), ["GET"]);
});

test("fails before API access when configuration is incomplete", async () => {
  let called = false;
  const client = { async request() { called = true; } };

  await assert.rejects(
    () => applyRevalidationFlow(client, { url: "", secret: "" }),
    /NEXT_REVALIDATE_URL and REVALIDATE_SECRET are required/u,
  );
  assert.equal(called, false);
});
