import test from "node:test";
import assert from "node:assert/strict";

import {
  COLLECTION_BUDGET_LIMIT,
  EDITOR_ALIAS_FIELD,
  EDITOR_CONTENT_FIELD,
  EDITOR_FIELD_OPTIONS,
  EDITOR_INTERFACE_NAME,
  EDITOR_JUNCTION_COLLECTION,
  EDITOR_TOOLS,
  EXPECTED_AFTER,
  buildAliasFieldPayload,
  buildContentBlocksFieldPayload,
  buildEditorRelationPayloads,
  buildJunctionCollectionPayload,
  collectEditorState,
  evaluateEditorState,
  runArticleEditorSetup,
} from "./setup-article-editor.mjs";

const BASE_ARTICLES_FIELDS = [
  { field: "id" },
  { field: "status" },
  { field: "title" },
  { field: "slug" },
  { field: "excerpt" },
  { field: "content" },
  { field: "translations" },
];

const DATA_COLLECTIONS = [
  "site_settings",
  "home_page",
  "pages",
  "page_sections",
  "navigation_items",
  "categories",
  "articles",
  "products",
  "faq_items",
  "lead_forms",
  "leads",
  "contact_channels",
  "recent_supplies",
  "product_images",
  "product_specifications",
  "product_documents",
  "seo_redirects",
  "orders",
  "order_items",
];

const productionCollections = (extra = []) => [
  ...DATA_COLLECTIONS.map((collection) => ({
    collection,
    meta: { folder: false },
  })),
  ...extra.map((collection) => ({ collection, meta: { folder: false } })),
  { collection: "group_content", meta: { folder: true } },
  { collection: "directus_users", meta: {} },
  { collection: "directus_files", meta: {} },
];

/**
 * Mock Directus client serving the collection list and the articles fields.
 * No live Directus is required.
 */
const mockClient = ({
  collections = productionCollections(),
  articlesFields = BASE_ARTICLES_FIELDS,
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
      if (path === "/fields/articles") return articlesFields;
      if (path.startsWith("/relations")) return relations;
      return [];
    },
  };
};

const writeRequests = (client) =>
  client.requests.filter((entry) => entry.method !== "GET");

test("targets the exact editor schema of the S1 acceptance", () => {
  assert.equal(EDITOR_JUNCTION_COLLECTION, "articles_editor_nodes");
  assert.equal(EDITOR_ALIAS_FIELD, "editor_nodes");
  assert.equal(EDITOR_CONTENT_FIELD, "content_blocks");
  assert.equal(EDITOR_INTERFACE_NAME, "flexible-editor");
  assert.equal(COLLECTION_BUDGET_LIMIT, 25);
  assert.deepEqual(EXPECTED_AFTER, {
    dataCollectionCount: 20,
    articlesChanged: 0,
    contentBlocksFilled: 0,
    junctionRows: 0,
  });
});

test("junction payload creates a hidden collection with a Generated UUID primary key", () => {
  const payload = buildJunctionCollectionPayload();

  assert.equal(payload.collection, EDITOR_JUNCTION_COLLECTION);
  assert.equal(payload.meta.hidden, true);
  assert.deepEqual(
    payload.fields.map(({ field }) => field),
    ["id", "articles_id", "collection", "item"],
  );

  const primaryKey = payload.fields.find(({ field }) => field === "id");
  assert.equal(primaryKey.type, "uuid");
  assert.equal(primaryKey.schema.is_primary_key, true);
  assert.deepEqual(primaryKey.meta.special, ["uuid"]);
});

test("alias payload is a hidden m2a alias without an interface", () => {
  const payload = buildAliasFieldPayload();

  assert.equal(payload.field, EDITOR_ALIAS_FIELD);
  assert.equal(payload.type, "alias");
  assert.equal(payload.meta.interface, null);
  assert.equal(payload.meta.hidden, true);
  assert.deepEqual(payload.meta.special, ["m2a"]);
  assert.equal(payload.schema, null);
});

test("relation payloads wire the M2A with cascade triggers and the allowed collections", () => {
  const relations = buildEditorRelationPayloads();

  // PRODUCTION R7 LESSON: exactly THREE relations, all junction-side. Posting
  // the alias-side relation makes Directus generate a DB foreign key on the
  // (column-less) alias field and fails; the alias side is auto-created via
  // meta.one_field on the junction-side owner relation.
  assert.equal(relations.length, 3);

  const ownerRelation = relations[0];
  assert.equal(ownerRelation.collection, EDITOR_JUNCTION_COLLECTION);
  assert.equal(ownerRelation.field, "articles_id");
  assert.equal(ownerRelation.related_collection, "articles");
  assert.equal(ownerRelation.meta.one_field, EDITOR_ALIAS_FIELD);
  assert.equal(ownerRelation.schema.on_delete, "CASCADE");

  const discriminatorRelation = relations[1];
  assert.equal(discriminatorRelation.field, "collection");
  assert.equal(discriminatorRelation.related_collection, null);
  assert.deepEqual(discriminatorRelation.meta.one_allowed_collections, [
    "products",
    "categories",
  ]);
  assert.equal(
    discriminatorRelation.meta.one_deselect_action,
    "delete",
    "deselecting a related item deletes the junction row",
  );

  const itemRelation = relations[2];
  assert.equal(itemRelation.field, "item");
  assert.equal(itemRelation.related_collection, null);
  assert.equal(itemRelation.meta.junction_field, "collection");
});

test("content_blocks payload uses the exact flexible-editor interface and tools", () => {
  const payload = buildContentBlocksFieldPayload();

  assert.equal(payload.field, EDITOR_CONTENT_FIELD);
  assert.equal(payload.type, "json");
  assert.equal(payload.schema.is_nullable, true);
  assert.equal(payload.meta.required, false);
  assert.equal(payload.meta.interface, EDITOR_INTERFACE_NAME);
  assert.equal(payload.meta.interface, "flexible-editor");
  assert.equal(payload.meta.options.m2aField, EDITOR_ALIAS_FIELD);
  assert.deepEqual(payload.meta.options.relationBlocks, ["products", "categories"]);

  const tools = payload.meta.options.tools;
  assert.equal(tools.includes("h1"), false, "H1 tool is disabled");
  for (const tool of ["h2", "h3", "h4", "bulletList", "orderedList", "blockquote", "link", "table"]) {
    assert.ok(tools.includes(tool), `${tool} tool is enabled`);
  }
  assert.deepEqual(EDITOR_FIELD_OPTIONS.tools, [...EDITOR_TOOLS]);
});

test("dry run plans the editor schema and performs no writes", async () => {
  const client = mockClient();
  const result = await runArticleEditorSetup(client);

  assert.equal(result.ok, true);
  assert.equal(result.stopped, false);
  assert.equal(result.applied, false);
  assert.equal(result.noop, false);
  assert.equal(writeRequests(client).length, 0, "no writes in dry-run mode");

  assert.deepEqual(
    result.report.map(({ action }) => action),
    [
      "create collection",
      "create field",
      "create relation",
      "create relation",
      "create relation",
      "create field",
    ],
  );
});

test("apply requires a release id", async () => {
  const client = mockClient();
  await assert.rejects(
    () => runArticleEditorSetup(client, { apply: true }),
    /release-id/i,
  );
  assert.equal(writeRequests(client).length, 0);
});

test("apply creates the junction before the alias, relations and content_blocks", async () => {
  const client = mockClient();
  const result = await runArticleEditorSetup(client, {
    apply: true,
    releaseId: "R5A-2026-08-14",
  });

  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.equal(result.releaseId, "R5A-2026-08-14");
  assert.equal(result.summary.projectedCollectionCount, 20);

  const writeOrder = client.requests
    .map((entry, index) => ({ ...entry, index }))
    .filter(({ method }) => method === "POST");
  const junctionPost = writeOrder.find(({ path }) => path === "/collections");
  const fieldPosts = writeOrder.filter(({ path }) => path === "/fields/articles");
  const aliasPost = fieldPosts.find(
    ({ body }) => JSON.parse(body).field === EDITOR_ALIAS_FIELD,
  );
  const contentPost = fieldPosts.find(
    ({ body }) => JSON.parse(body).field === EDITOR_CONTENT_FIELD,
  );
  const relationPosts = writeOrder.filter(({ path }) => path === "/relations");

  assert.equal(fieldPosts.length, 2);
  assert.equal(relationPosts.length, 3);
  assert.ok(junctionPost, "creates the junction collection");
  // ORDER MATTERS: junction first (extension README), alias field before the
  // relations that reference it, content_blocks last.
  assert.ok(aliasPost.index > junctionPost.index, "alias field after the junction");
  assert.ok(
    relationPosts[0].index > aliasPost.index,
    "relations after the alias field",
  );
  assert.ok(
    contentPost.index > relationPosts.at(-1).index,
    "content_blocks after the relations",
  );

  const junctionBody = JSON.parse(junctionPost.body);
  assert.equal(junctionBody.collection, EDITOR_JUNCTION_COLLECTION);
});

test("apply never touches articles.content or any item data", async () => {
  const client = mockClient();
  await runArticleEditorSetup(client, { apply: true, releaseId: "R5A" });

  for (const { path } of client.requests) {
    assert.doesNotMatch(path, /\/fields\/articles\/content/, "articles.content is untouched");
    assert.doesNotMatch(path, /\/items\//, "no item data is written");
    assert.doesNotMatch(path, /\/collections\/articles/, "the articles collection is not recreated");
  }
  for (const { method, body } of writeRequests(client)) {
    const field = JSON.parse(body ?? "{}").field;
    assert.notEqual(field, "content", "no write targets articles.content");
  }
});

test("a fully applied schema reports as a clean idempotent no-op", async () => {
  const client = mockClient({
    collections: productionCollections([EDITOR_JUNCTION_COLLECTION]),
    articlesFields: [
      ...BASE_ARTICLES_FIELDS,
      { field: EDITOR_ALIAS_FIELD },
      { field: EDITOR_CONTENT_FIELD },
    ],
    relations: buildEditorRelationPayloads().map(({ collection, field }) => ({ collection, field })),
  });
  const result = await runArticleEditorSetup(client, { apply: true, releaseId: "R5A" });

  assert.equal(result.ok, true);
  assert.equal(result.stopped, false);
  assert.equal(result.noop, true);
  assert.equal(result.applied, false);
  assert.equal(writeRequests(client).length, 0, "already applied performs no writes");
});

test("RESUMES after a partial apply instead of stopping (production R7 lesson)", async () => {
  // Partial state from the failed first apply: junction + alias field exist,
  // relations and content_blocks are missing. The run must skip the existing
  // pieces and create ONLY the missing ones.
  const client = mockClient({
    collections: productionCollections([EDITOR_JUNCTION_COLLECTION]),
    articlesFields: [...BASE_ARTICLES_FIELDS, { field: EDITOR_ALIAS_FIELD }],
  });
  const result = await runArticleEditorSetup(client, { apply: true, releaseId: "R5A-resume" });

  assert.equal(result.ok, true);
  assert.equal(result.stopped, false);
  assert.equal(result.noop, false);
  assert.equal(result.applied, true);

  const actions = result.report.map(({ action }) => action);
  assert.deepEqual(actions, [
    "skip existing collection",
    "skip existing field",
    "create relation",
    "create relation",
    "create relation",
    "create field",
  ]);

  const posts = writeRequests(client);
  assert.equal(posts.length, 4, "only the missing relations + content_blocks are written");
  assert.ok(posts.every(({ path }) => path === "/relations" || path === "/fields/articles"));
  const fieldBodies = posts
    .filter(({ path }) => path === "/fields/articles")
    .map(({ body }) => JSON.parse(body).field);
  assert.deepEqual(fieldBodies, [EDITOR_CONTENT_FIELD]);
});

test("STOPS when the collection budget would exceed the Core limit", async () => {
  const extras = Array.from(
    { length: COLLECTION_BUDGET_LIMIT - DATA_COLLECTIONS.length },
    (_, index) => `extra_collection_${index + 1}`,
  );
  const client = mockClient({ collections: productionCollections(extras) });
  const result = await runArticleEditorSetup(client, { apply: true, releaseId: "R5A" });

  assert.equal(result.stopped, true);
  assert.ok(
    result.blockers.some((blocker) => blocker.code === "collection-budget"),
  );
  assert.equal(writeRequests(client).length, 0);
});

test("STOPS when articles, products or categories are missing", async () => {
  for (const missing of ["articles", "products", "categories"]) {
    const client = mockClient({
      collections: productionCollections().filter(
        ({ collection }) => collection !== missing,
      ),
    });
    const result = await runArticleEditorSetup(client, { apply: true, releaseId: "R5A" });

    assert.equal(result.stopped, true, `missing ${missing} stops the run`);
    assert.ok(
      result.blockers.some(
        (blocker) =>
          blocker.code === "missing-collection" && blocker.detail.includes(missing),
      ),
    );
    assert.equal(writeRequests(client).length, 0);
  }
});

test("folders and system collections do not count towards the budget", async () => {
  const state = await collectEditorState(mockClient());
  assert.equal(state.dataCollectionCount, 19);
  assert.equal(evaluateEditorState(state).projectedCollectionCount, 20);
  assert.equal(evaluateEditorState(state).ok, true);
});
