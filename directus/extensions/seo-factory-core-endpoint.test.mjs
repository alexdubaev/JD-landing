import assert from "node:assert/strict";
import test from "node:test";

import {
  readPublishedInputs,
  upsertShadowWorkItem,
} from "./directus-extension-seo-factory/dist/index.js";

const worker = { role: "seo-worker" };

function createFakeDatabase() {
  const tables = {
    products: [
      { id: "product-published", status: "published", slug: "tractor", title: "Tractor", seo_title: "Tractor SEO", seo_description: "Tractor description", private_note: "do not expose" },
      { id: "product-published-second", status: "published", slug: "combine", title: "Combine", seo_title: "Combine SEO", seo_description: "Combine description", private_note: "do not expose" },
      { id: "product-draft", status: "draft", slug: "draft-tractor", title: "Draft tractor", seo_title: "Draft", seo_description: "Draft description", private_note: "do not expose" },
    ],
    categories: [
      { id: "category-published", status: "published", slug: "tractors", title: "Tractors", seo_title: "Tractors SEO", seo_description: "Tractors description" },
    ],
    pages: [
      { id: "page-published", status: "published", slug: "delivery", title: "Delivery", seo_title: "Delivery SEO", seo_description: "Delivery description" },
    ],
  };
  const writes = [];
  const queries = [];

  function database(table) {
    let selected = [];
    let status;
    let limit;
    const query = {
      select(...fields) {
        selected = fields;
        return query;
      },
      where(criteria) {
        status = criteria.status;
        return query;
      },
      limit(value) {
        limit = value;
        return query;
      },
      insert(data) {
        return {
          onConflict(field) {
            return {
              async merge(update) {
                writes.push({ table, data, field, update });
              },
            };
          },
        };
      },
      then(resolve, reject) {
        queries.push({ table, fields: selected, status, limit });
        const rows = (tables[table] ?? [])
          .filter((row) => row.status === status)
          .slice(0, limit)
          .map((row) => Object.fromEntries(selected.map((field) => [field, row[field]])));
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
    return query;
  }

  database.writes = writes;
  database.queries = queries;
  return database;
}

const recommendation = {
  dedupe_key: "products:tractor:missing-title",
  entity_type: "products",
  entity_id: "9e84190b-1cc6-4b1a-9a2c-3d6c9c6a4c4e",
  entity_key: "tractor",
  type: "missing_meta",
  subtype: "missing_seo_title",
  title: "Tractor needs an SEO title",
  summary: "The published tractor has no SEO title.",
  recommendation: "Add a useful, concise SEO title.",
  patch_json: { seo_title: "Tractor — characteristics and consultation" },
  status: "published",
  unexpected_field: "must not reach the database",
};

test.before(() => {
  process.env.SEO_FACTORY_WORKER_ROLE_ID = worker.role;
});

test("inputs returns only limited published source fields", async () => {
  const fakeDatabase = createFakeDatabase();
  const rows = await readPublishedInputs({ database: fakeDatabase, accountability: worker, request: { body: { limit: 1 } } });
  assert.deepEqual(Object.keys(rows.products[0]).sort(), ["id", "seo_description", "seo_title", "slug", "status", "title"]);
  assert.equal(rows.products[0].status, "published");
  assert.deepEqual(fakeDatabase.queries, [
    { table: "products", fields: ["id", "status", "slug", "title", "seo_title", "seo_description"], status: "published", limit: 1 },
    { table: "categories", fields: ["id", "status", "slug", "title", "seo_title", "seo_description"], status: "published", limit: 1 },
    { table: "pages", fields: ["id", "status", "slug", "title", "seo_title", "seo_description"], status: "published", limit: 1 },
  ]);
});

test("queue endpoint forces ready and writes only seo_work_items", async () => {
  const fakeDatabase = createFakeDatabase();
  const result = await upsertShadowWorkItem({ database: fakeDatabase, accountability: worker, request: { body: recommendation } });
  assert.equal(result.status, "ready");
  assert.deepEqual(fakeDatabase.writes.map(({ table }) => table), ["seo_work_items"]);
  assert.deepEqual(fakeDatabase.writes[0], {
    table: "seo_work_items",
    field: "dedupe_key",
    data: {
      dedupe_key: "products:tractor:missing-title",
      entity_type: "products",
      entity_id: "9e84190b-1cc6-4b1a-9a2c-3d6c9c6a4c4e",
      entity_key: "tractor",
      type: "missing_meta",
      subtype: "missing_seo_title",
      title: "Tractor needs an SEO title",
      summary: "The published tractor has no SEO title.",
      recommendation: "Add a useful, concise SEO title.",
      patch_json: { seo_title: "Tractor — characteristics and consultation" },
      status: "ready",
    },
    update: {
      dedupe_key: "products:tractor:missing-title",
      entity_type: "products",
      entity_id: "9e84190b-1cc6-4b1a-9a2c-3d6c9c6a4c4e",
      entity_key: "tractor",
      type: "missing_meta",
      subtype: "missing_seo_title",
      title: "Tractor needs an SEO title",
      summary: "The published tractor has no SEO title.",
      recommendation: "Add a useful, concise SEO title.",
      patch_json: { seo_title: "Tractor — characteristics and consultation" },
      status: "ready",
    },
  });
});

test("endpoint rejects a non-worker role", async () => {
  await assert.rejects(() => readPublishedInputs({ database: createFakeDatabase(), accountability: { role: "other" }, request: { body: {} } }), /not authorized/u);
});

test("inputs reject out-of-range limits and the queue rejects invalid recommendations", async () => {
  const fakeDatabase = createFakeDatabase();
  await assert.rejects(
    () => readPublishedInputs({ database: fakeDatabase, accountability: worker, request: { body: { limit: 1000 } } }),
    /request is invalid/u,
  );
  await assert.rejects(
    () => upsertShadowWorkItem({ database: fakeDatabase, accountability: worker, request: { body: { ...recommendation, entity_type: "orders", dedupe_key: "" } } }),
    /request is invalid/u,
  );
});

test("queue rejects database-incompatible recommendation values", async () => {
  const fakeDatabase = createFakeDatabase();
  for (const body of [
    { ...recommendation, entity_id: "not-a-uuid" },
    { ...recommendation, priority_score: 0.5 },
    { ...recommendation, confidence: 0.12345 },
    { ...recommendation, confidence: 10 },
  ]) {
    await assert.rejects(
      () => upsertShadowWorkItem({ database: fakeDatabase, accountability: worker, request: { body } }),
      /request is invalid/u,
    );
  }
  assert.deepEqual(fakeDatabase.writes, []);
});

test("queue caps URL and title to the database varchar limit", async () => {
  const fakeDatabase = createFakeDatabase();
  const oversized = "x".repeat(300);
  await upsertShadowWorkItem({
    database: fakeDatabase,
    accountability: worker,
    request: { body: { ...recommendation, url: oversized, title: oversized } },
  });
  assert.equal(fakeDatabase.writes[0].data.url.length, 255);
  assert.equal(fakeDatabase.writes[0].data.title.length, 255);
});
