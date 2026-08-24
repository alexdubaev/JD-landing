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
  return database;
}

const recommendation = {
  dedupe_key: "products:tractor:missing-title",
  entity_type: "products",
  entity_id: "product-published",
  entity_key: "tractor",
  type: "missing_meta",
  subtype: "missing_seo_title",
  title: "Tractor needs an SEO title",
  summary: "The published tractor has no SEO title.",
  recommendation: "Add a useful, concise SEO title.",
  patch_json: { seo_title: "Tractor — characteristics and consultation" },
};

test.before(() => {
  process.env.SEO_FACTORY_WORKER_ROLE_ID = worker.role;
});

test("inputs returns only limited published source fields", async () => {
  const rows = await readPublishedInputs({ database: createFakeDatabase(), accountability: worker, request: { body: { limit: 1 } } });
  assert.deepEqual(Object.keys(rows.products[0]).sort(), ["id", "seo_description", "seo_title", "slug", "status", "title"]);
  assert.equal(rows.products[0].status, "published");
});

test("queue endpoint forces ready and writes only seo_work_items", async () => {
  const fakeDatabase = createFakeDatabase();
  const result = await upsertShadowWorkItem({ database: fakeDatabase, accountability: worker, request: { body: recommendation } });
  assert.equal(result.status, "ready");
  assert.deepEqual(fakeDatabase.writes.map(({ table }) => table), ["seo_work_items"]);
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
