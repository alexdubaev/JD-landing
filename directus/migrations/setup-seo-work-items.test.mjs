import test from "node:test";
import assert from "node:assert/strict";

import {
  COLLECTION_BUDGET_LIMIT,
  EXPECTED_AFTER,
  REQUIRED_COLLECTIONS,
  SEO_WORK_ITEMS_COLLECTION,
  SEO_WORK_ITEMS_RELATED_COLLECTION,
  SEO_WORK_ITEMS_RELATION_FIELD,
  STATUS_CHOICES,
  buildArticleRelationPayload,
  buildSeoWorkItemsCollectionPayload,
  buildSeoWorkItemsFieldPayloads,
  collectSeoWorkItemsState,
  evaluateSeoWorkItemsState,
  runSeoWorkItemsSetup,
  seoWorkItemsFieldNames,
} from "./setup-seo-work-items.mjs";
import { schemaBlueprint } from "../schema/blueprint.mjs";
import { buildWorkItem, computeBeforeHash } from "../../seo-worker/src/work-items.mjs";

// The 22 data collections of the production schema BEFORE this release
// (folders and directus_* system collections never count towards the budget).
const DATA_COLLECTIONS = [
  "site_settings",
  "home_page",
  "pages",
  "page_sections",
  "navigation_items",
  "categories",
  "articles",
  "articles_editor_nodes",
  "products",
  "faq_items",
  "lead_forms",
  "leads",
  "contact_channels",
  "recent_supplies",
  "product_images",
  "product_specifications",
  "product_documents",
  "product_codes",
  "products_analogs",
  "seo_redirects",
  "orders",
  "order_items",
];

const SPEC_FIELD_NAMES = [
  "id",
  "type",
  "subtype",
  "status",
  "severity",
  "priority_score",
  "confidence",
  "entity_type",
  "entity_id",
  "entity_key",
  "url",
  "title",
  "summary",
  "recommendation",
  "current_value_json",
  "proposed_value_json",
  "patch_json",
  "evidence_json",
  "sources_json",
  "metrics_json",
  "dedupe_key",
  "before_hash",
  "article",
  "worker_run_id",
  "claimed_at",
  "expires_at",
  "applied_at",
  "rolled_back_at",
  "last_error",
  "created_at",
  "updated_at",
];

const productionCollections = (extra = []) => [
  ...[...DATA_COLLECTIONS, ...extra].map((collection) => ({
    collection,
    meta: { folder: false },
  })),
  { collection: "group_content", meta: { folder: true } },
  { collection: "directus_users", meta: {} },
  { collection: "directus_files", meta: {} },
];

/**
 * Mock Directus client serving the collection list, the seo_work_items fields
 * and the relations. No live Directus is required.
 */
const mockClient = ({
  collections = productionCollections(),
  workItemsFields = [],
  relations = [],
} = {}) => {
  const requests = [];
  return {
    requests,
    async request(path, options = {}) {
      const method = options.method ?? "GET";
      requests.push({ path, method, body: options.body });
      if (method !== "GET") return null;
      if (path === "/collections") return collections;
      if (path === `/fields/${SEO_WORK_ITEMS_COLLECTION}`) return workItemsFields;
      if (path.startsWith("/relations")) return relations;
      return [];
    },
  };
};

const writeRequests = (client) =>
  client.requests.filter((entry) => entry.method !== "GET");

test("targets the exact architecture-spec field list and budget 22 -> 23", () => {
  assert.equal(SEO_WORK_ITEMS_COLLECTION, "seo_work_items");
  assert.deepEqual(REQUIRED_COLLECTIONS, ["articles"]);
  assert.deepEqual(seoWorkItemsFieldNames(), SPEC_FIELD_NAMES);
  assert.deepEqual(STATUS_CHOICES, [
    "draft",
    "ready",
    "review",
    "applied",
    "rolled_back",
    "rejected",
  ]);
  assert.equal(COLLECTION_BUDGET_LIMIT, 25);
  assert.deepEqual(EXPECTED_AFTER, {
    dataCollectionCount: 23,
    workItemsCreated: 0,
    articlesChanged: 0,
  });

  // The migration reads the blueprint definition, never a restated copy.
  const blueprintCollection = schemaBlueprint.collections.find(
    ({ name }) => name === SEO_WORK_ITEMS_COLLECTION,
  );
  assert.deepEqual(
    buildSeoWorkItemsFieldPayloads().map(({ field }) => field),
    blueprintCollection.fields
      .filter((field) => !field.primary)
      .map(({ name }) => name),
  );
});

test("payloads create the collection with the spec fields in order", () => {
  const collection = buildSeoWorkItemsCollectionPayload();

  assert.equal(collection.collection, SEO_WORK_ITEMS_COLLECTION);
  assert.equal(collection.schema.name, SEO_WORK_ITEMS_COLLECTION);
  // Fields are posted individually after the collection: the collection
  // payload carries ONLY the primary key.
  assert.deepEqual(
    collection.fields.map(({ field }) => field),
    ["id"],
  );
  const primaryKey = collection.fields[0];
  assert.equal(primaryKey.type, "uuid");
  assert.equal(primaryKey.schema.is_primary_key, true);
  assert.equal(primaryKey.schema.is_nullable, false);

  const fields = buildSeoWorkItemsFieldPayloads();
  assert.deepEqual(
    fields.map(({ field }) => field),
    SPEC_FIELD_NAMES.filter((name) => name !== "id"),
  );

  // Status is Directus choices, never a SQL enum.
  const status = fields.find(({ field }) => field === "status");
  assert.equal(status.type, "string");
  assert.equal(status.schema.is_nullable, false);
  assert.deepEqual(
    status.meta.options.choices.map(({ value }) => value),
    STATUS_CHOICES,
  );

  // dedupe_key stays a plain indexed column here — the PHYSICAL unique
  // constraint is owned by migrations/sql/seo-work-items-constraints-up.sql.
  const dedupeKey = fields.find(({ field }) => field === "dedupe_key");
  assert.equal(dedupeKey.schema.is_nullable, false);
  assert.equal(dedupeKey.schema.is_indexed, true);
  assert.equal(dedupeKey.schema.is_unique, false, "the unique constraint is owned by the SQL file");

  for (const name of [
    "current_value_json",
    "proposed_value_json",
    "patch_json",
    "evidence_json",
    "sources_json",
    "metrics_json",
  ]) {
    const jsonField = fields.find(({ field }) => field === name);
    assert.equal(jsonField.type, "json", `${name} is json`);
    assert.equal(jsonField.schema.is_nullable, true, `${name} is nullable`);
  }

  // article is an ordinary nullable uuid column at the field level.
  const article = fields.find(({ field }) => field === SEO_WORK_ITEMS_RELATION_FIELD);
  assert.equal(article.type, "uuid");
  assert.equal(article.schema.is_nullable, true);
});

test("the article relation is junction-side only with SET NULL", () => {
  const relation = buildArticleRelationPayload();

  // PRODUCTION R7 LESSON: exactly ONE relation, the junction-side M2O.
  // meta.one_field stays null — no O2M alias is ever posted for articles.
  assert.equal(relation.collection, SEO_WORK_ITEMS_COLLECTION);
  assert.equal(relation.field, SEO_WORK_ITEMS_RELATION_FIELD);
  assert.equal(relation.related_collection, SEO_WORK_ITEMS_RELATED_COLLECTION);
  assert.equal(relation.meta.one_field, null, "never posts an alias side");
  assert.equal(relation.schema.on_delete, "SET NULL", "article deletion keeps the work item");
});

test("dry run plans the collection, fields and relation without writes", async () => {
  const client = mockClient();
  const result = await runSeoWorkItemsSetup(client);

  assert.equal(result.ok, true);
  assert.equal(result.stopped, false);
  assert.equal(result.applied, false);
  assert.equal(result.noop, false);
  assert.equal(writeRequests(client).length, 0, "no writes in dry-run mode");
  assert.equal(result.summary.projectedCollectionCount, 23);

  const actions = result.report.map(({ action }) => action);
  assert.equal(actions.length, 1 + 30 + 1, "collection + 30 fields + relation");
  assert.equal(actions[0], "create collection");
  assert.equal(actions.at(-1), "create relation");
  assert.ok(actions.slice(1, -1).every((action) => action === "create field"));
});

test("apply requires a release id", async () => {
  const client = mockClient();
  await assert.rejects(
    () => runSeoWorkItemsSetup(client, { apply: true }),
    /release-id/i,
  );
  assert.equal(writeRequests(client).length, 0);
});

test("apply creates the collection first, then the fields, then the relation", async () => {
  const client = mockClient();
  const result = await runSeoWorkItemsSetup(client, {
    apply: true,
    releaseId: "R10A-2026-08-18",
  });

  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.equal(result.releaseId, "R10A-2026-08-18");

  const posts = client.requests
    .map((entry, index) => ({ ...entry, index }))
    .filter(({ method }) => method === "POST");
  const collectionPost = posts.find(({ path }) => path === "/collections");
  const fieldPosts = posts.filter(
    ({ path }) => path === `/fields/${SEO_WORK_ITEMS_COLLECTION}`,
  );
  const relationPosts = posts.filter(({ path }) => path === "/relations");

  assert.equal(fieldPosts.length, 30);
  assert.equal(relationPosts.length, 1);
  // ORDER MATTERS: collection before any field, relation after its column.
  assert.ok(collectionPost, "creates the collection");
  for (const fieldPost of fieldPosts) {
    assert.ok(fieldPost.index > collectionPost.index, "fields after the collection");
  }
  assert.ok(
    relationPosts[0].index > fieldPosts.at(-1).index,
    "relation after the article field",
  );

  // Fields arrive in spec order.
  assert.deepEqual(
    fieldPosts.map(({ body }) => JSON.parse(body).field),
    SPEC_FIELD_NAMES.filter((name) => name !== "id"),
  );

  const relationBody = JSON.parse(relationPosts[0].body);
  assert.equal(relationBody.collection, SEO_WORK_ITEMS_COLLECTION);
  assert.equal(relationBody.related_collection, SEO_WORK_ITEMS_RELATED_COLLECTION);
});

test("apply never writes item data and never recreates articles", async () => {
  const client = mockClient();
  await runSeoWorkItemsSetup(client, { apply: true, releaseId: "R10A" });

  for (const { path } of client.requests) {
    assert.doesNotMatch(path, /\/items\//, "no item data is written");
    assert.doesNotMatch(
      path,
      new RegExp(`/collections/${SEO_WORK_ITEMS_RELATED_COLLECTION}`),
      "the articles collection is not touched",
    );
    assert.doesNotMatch(
      path,
      new RegExp(`/fields/${SEO_WORK_ITEMS_RELATED_COLLECTION}`),
      "no field is added to articles",
    );
  }
});

test("a fully applied schema reports as a clean idempotent no-op", async () => {
  const client = mockClient({
    collections: productionCollections([SEO_WORK_ITEMS_COLLECTION]),
    workItemsFields: SPEC_FIELD_NAMES.map((field) => ({ field })),
    relations: [
      {
        collection: SEO_WORK_ITEMS_COLLECTION,
        field: SEO_WORK_ITEMS_RELATION_FIELD,
      },
    ],
  });
  const result = await runSeoWorkItemsSetup(client, { apply: true, releaseId: "R10A" });

  assert.equal(result.ok, true);
  assert.equal(result.stopped, false);
  assert.equal(result.noop, true);
  assert.equal(result.applied, false);
  assert.equal(writeRequests(client).length, 0, "already applied performs no writes");
});

test("RESUMES after a partial apply instead of stopping (production R7 lesson)", async () => {
  // Partial state: the collection and the first half of the fields exist, the
  // rest and the article relation are missing. The run must skip the existing
  // pieces and create ONLY the missing ones.
  const existingFields = SPEC_FIELD_NAMES.slice(0, 16);
  const client = mockClient({
    collections: productionCollections([SEO_WORK_ITEMS_COLLECTION]),
    workItemsFields: existingFields.map((field) => ({ field })),
  });
  const result = await runSeoWorkItemsSetup(client, { apply: true, releaseId: "R10A-resume" });

  assert.equal(result.ok, true);
  assert.equal(result.stopped, false);
  assert.equal(result.noop, false);
  assert.equal(result.applied, true);

  const actions = result.report.map(({ action }) => action);
  assert.equal(actions.filter((action) => action === "skip existing field").length, 15);
  assert.equal(actions.filter((action) => action === "create field").length, 15);
  assert.equal(actions.filter((action) => action === "create relation").length, 1);
  assert.ok(actions.includes("skip existing collection"));

  const posts = writeRequests(client);
  assert.equal(posts.length, 16, "only the missing fields + relation are written");
  assert.deepEqual(
    posts
      .filter(({ path }) => path === `/fields/${SEO_WORK_ITEMS_COLLECTION}`)
      .map(({ body }) => JSON.parse(body).field),
    SPEC_FIELD_NAMES.slice(16).filter((name) => name !== "id"),
  );
});

test("STOPS when the collection budget would exceed the Core limit", async () => {
  const extras = Array.from(
    { length: COLLECTION_BUDGET_LIMIT - DATA_COLLECTIONS.length },
    (_, index) => `extra_collection_${index + 1}`,
  );
  const client = mockClient({ collections: productionCollections(extras) });
  const result = await runSeoWorkItemsSetup(client, { apply: true, releaseId: "R10A" });

  assert.equal(result.stopped, true);
  assert.ok(
    result.blockers.some((blocker) => blocker.code === "collection-budget"),
  );
  assert.equal(writeRequests(client).length, 0);
});

test("the budget allows exactly 24 existing data collections (23 + 1 = 25)", async () => {
  const extras = Array.from(
    { length: COLLECTION_BUDGET_LIMIT - DATA_COLLECTIONS.length - 1 },
    (_, index) => `extra_collection_${index + 1}`,
  );
  const client = mockClient({ collections: productionCollections(extras) });
  const result = await runSeoWorkItemsSetup(client, { apply: true, releaseId: "R10A" });

  assert.equal(result.stopped, false);
  assert.equal(result.summary.projectedCollectionCount, COLLECTION_BUDGET_LIMIT);
});

test("STOPS when articles is missing (the M2O target)", async () => {
  const client = mockClient({
    collections: productionCollections().filter(
      ({ collection }) => collection !== SEO_WORK_ITEMS_RELATED_COLLECTION,
    ),
  });
  const result = await runSeoWorkItemsSetup(client, { apply: true, releaseId: "R10A" });

  assert.equal(result.stopped, true);
  assert.ok(
    result.blockers.some(
      (blocker) =>
        blocker.code === "missing-collection" &&
        blocker.detail.includes(SEO_WORK_ITEMS_RELATED_COLLECTION),
    ),
  );
  assert.equal(writeRequests(client).length, 0);
});

test("folders and system collections do not count towards the budget", async () => {
  const state = await collectSeoWorkItemsState(mockClient());
  assert.equal(state.dataCollectionCount, 22);
  assert.equal(evaluateSeoWorkItemsState(state).projectedCollectionCount, 23);
  assert.equal(evaluateSeoWorkItemsState(state).ok, true);
});

test("W1 contract: the seo-worker emits exactly schema field names and only draft status", async () => {
  // seo-worker/src/work-items.mjs buildWorkItem is the finished W1 writer.
  // The schema is the spec — if names ever diverge, the WORKER gets an
  // adapter, never this schema. This test is the tripwire.
  const before = { seo_title: "", seo_description: "" };
  const workItem = buildWorkItem({
    input: {
      type: "seo_meta",
      subtype: "missing_seo_title",
      entity_type: "products",
      entity_key: "product-12345",
      entity_id: 12345,
      url: "https://shop.test/catalog/tractors/p12345",
      title: "Product 12345 is missing an SEO title",
      summary: "Product 12345 has an empty seo_title field.",
      recommendation: "Add a concise, commercial seo_title for product 12345.",
      evidence: [
        {
          claim: "seo_title is empty for product 12345",
          tier: "single",
          source: { type: "crawl", url: "https://shop.test/catalog/tractors/p12345" },
        },
      ],
      sources: [{ type: "crawl", url: "https://shop.test/catalog/tractors/p12345" }],
      patch: { seo_title: "Трактор John Deere XYZ — характеристики и цена" },
      before_hash: computeBeforeHash(before),
      article: null,
      metrics: { position: 12 },
    },
    allowlist: { products: ["seo_title", "seo_description"] },
    runId: "run-contract-test",
  });

  const schemaFields = new Set(seoWorkItemsFieldNames());
  for (const key of Object.keys(workItem)) {
    assert.ok(
      schemaFields.has(key),
      `worker writes ${key}, which is missing from the seo_work_items schema`,
    );
  }

  // Draft-only invariant, schema-side: the only status the worker may emit is
  // a declared choice, and it is "draft".
  assert.equal(workItem.status, "draft");
  assert.ok(STATUS_CHOICES.includes(workItem.status));
  assert.equal(workItem.worker_run_id, "run-contract-test");
  assert.equal(typeof workItem.dedupe_key, "string");
  assert.ok(workItem.dedupe_key.length > 0);
});
