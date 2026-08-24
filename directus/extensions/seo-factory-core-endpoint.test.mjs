import assert from "node:assert/strict";
import test from "node:test";

import registerSeoFactoryEndpoint, * as seoFactory from "./directus-extension-seo-factory/dist/index.js";

const {
  createClaimedDraft,
  readPublishedInputs,
  releaseClaim,
  upsertShadowWorkItem,
} = seoFactory;

const worker = { role: "seo-worker" };
const WORK_ITEM_ID = "11111111-1111-4111-8111-111111111111";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function createFakeDatabase({ workerRunId = "run-a", failArticleInsert = false } = {}) {
  let tables = {
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
    seo_work_items: [
      { id: WORK_ITEM_ID, status: "processing", worker_run_id: workerRunId, expires_at: "2026-08-24T12:00:00.000Z", article: null, last_error: null },
    ],
    seo_factory_claims: [
      { work_item_id: WORK_ITEM_ID, run_id: workerRunId, state: "processing", lease_until: "2026-08-24T12:00:00.000Z", draft_id: null, last_error: null },
    ],
    articles: [],
  };
  const writes = [];
  const queries = [];
  const articleWrites = [];
  const locks = [];

  function database(table) {
    let selected = [];
    let criteria = {};
    let limit;
    const query = {
      select(...fields) {
        selected = fields;
        return query;
      },
      where(values) {
        criteria = { ...criteria, ...values };
        return query;
      },
      forUpdate() {
        locks.push({ table, criteria: { ...criteria } });
        return query;
      },
      async first() {
        return (tables[table] ?? []).find((row) => Object.entries(criteria).every(([field, value]) => row[field] === value));
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
          async returning() {
            if (table === "articles" && failArticleInsert) throw new Error("database detail must stay private");
            if (table === "articles" && !UUID_PATTERN.test(data.id)) throw new Error("articles.id must be supplied as a UUID");
            const row = { ...data };
            tables[table] ??= [];
            tables[table].push(row);
            if (table === "articles") articleWrites.push({ ...data });
            return [{ id: row.id }];
          },
        };
      },
      async update(data) {
        let count = 0;
        for (const row of tables[table] ?? []) {
          if (Object.entries(criteria).every(([field, value]) => row[field] === value)) {
            Object.assign(row, data);
            count += 1;
          }
        }
        return count;
      },
      then(resolve, reject) {
        queries.push({ table, fields: selected, status: criteria.status, limit });
        const rows = (tables[table] ?? [])
          .filter((row) => Object.entries(criteria).every(([field, value]) => row[field] === value))
          .slice(0, limit)
          .map((row) => Object.fromEntries(selected.map((field) => [field, row[field]])));
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
    return query;
  }

  database.writes = writes;
  database.queries = queries;
  database.articleWrites = articleWrites;
  database.locks = locks;
  database.table = (name) => tables[name];
  database.fn = { now: () => "database-now" };
  database.transaction = async (action) => {
    const snapshot = structuredClone(tables);
    const articleWriteCount = articleWrites.length;
    try {
      return await action(database);
    } catch (error) {
      tables = snapshot;
      articleWrites.length = articleWriteCount;
      throw error;
    }
  };
  return database;
}

function claimedRequest(runId, text = "Safe draft") {
  return {
    headers: { "x-seo-worker-run": runId },
    body: {
      id: WORK_ITEM_ID,
      status: "published",
      title: text,
      excerpt: text,
      sections: [{ heading: `${text} heading`, body: `${text} body` }],
    },
  };
}

function releaseRequest(runId) {
  return {
    headers: { "x-seo-worker-run": runId },
    body: { id: WORK_ITEM_ID, error: "temporary draft failure" },
  };
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

test("draft endpoint creates an escaped draft and completes its own claim", async () => {
  const fakeDatabase = createFakeDatabase();
  const result = await createClaimedDraft({ database: fakeDatabase, accountability: worker, request: claimedRequest("run-a", "<img onerror=1>") });
  assert.equal(result.status, "draft_created");
  assert.equal(fakeDatabase.articleWrites[0].status, "draft");
  assert.match(fakeDatabase.articleWrites[0].content, /&lt;img onerror=1&gt;/u);
  assert.equal(fakeDatabase.articleWrites[0].title, "&lt;img onerror=1&gt;");
  assert.doesNotMatch(fakeDatabase.articleWrites[0].content, /<img\b/iu);
  const draftId = fakeDatabase.articleWrites[0].id;
  assert.match(draftId, UUID_PATTERN);
  assert.deepEqual(fakeDatabase.locks[0], { table: "seo_work_items", criteria: { id: WORK_ITEM_ID } });
  assert.deepEqual(fakeDatabase.table("seo_work_items")[0], {
    id: WORK_ITEM_ID,
    status: "draft_created",
    worker_run_id: "run-a",
    expires_at: null,
    article: draftId,
    last_error: null,
  });
  assert.deepEqual(fakeDatabase.table("seo_factory_claims")[0], {
    work_item_id: WORK_ITEM_ID,
    run_id: "run-a",
    state: "draft_created",
    lease_until: null,
    draft_id: draftId,
    last_error: null,
    updated_at: "database-now",
  });
});

test("draft and release reject a claim owned by another run", async () => {
  const fakeDatabase = createFakeDatabase();
  await assert.rejects(() => createClaimedDraft({ database: fakeDatabase, accountability: worker, request: claimedRequest("run-b") }), /claim not owned/u);
  await assert.rejects(() => releaseClaim({ database: fakeDatabase, accountability: worker, request: releaseRequest("run-b") }), /claim not owned/u);
  assert.deepEqual(fakeDatabase.articleWrites, []);
  assert.equal(fakeDatabase.table("seo_work_items")[0].status, "processing");
});

test("draft forces status and escapes every worker-supplied text field", async () => {
  const fakeDatabase = createFakeDatabase();
  await createClaimedDraft({
    database: fakeDatabase,
    accountability: worker,
    request: claimedRequest("run-a", "<script>alert('x')</script> & quoted"),
  });
  const article = fakeDatabase.articleWrites[0];
  assert.equal(article.status, "draft");
  assert.doesNotMatch(JSON.stringify(article), /<script\b/iu);
  assert.match(article.content, /&lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt; &amp; quoted heading/u);
  assert.match(article.content, /&lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt; &amp; quoted body/u);
});

test("failed article insertion rolls back so only the owning run can release for retry", async () => {
  const fakeDatabase = createFakeDatabase({ failArticleInsert: true });
  await assert.rejects(() => createClaimedDraft({ database: fakeDatabase, accountability: worker, request: claimedRequest("run-a") }));
  assert.deepEqual(fakeDatabase.articleWrites, []);
  assert.equal(fakeDatabase.table("seo_work_items")[0].status, "processing");
  assert.equal(fakeDatabase.table("seo_factory_claims")[0].state, "processing");
  await assert.rejects(() => releaseClaim({ database: fakeDatabase, accountability: worker, request: releaseRequest("run-b") }), /claim not owned/u);
  const result = await releaseClaim({ database: fakeDatabase, accountability: worker, request: releaseRequest("run-a") });
  assert.deepEqual(result, { id: WORK_ITEM_ID, status: "retryable" });
  assert.equal(fakeDatabase.table("seo_work_items")[0].status, "retryable");
  assert.equal(fakeDatabase.table("seo_factory_claims")[0].state, "retryable");
});

test("draft and release require the bounded worker run header", async () => {
  const fakeDatabase = createFakeDatabase();
  for (const action of [createClaimedDraft, releaseClaim]) {
    await assert.rejects(
      () => action({ database: fakeDatabase, accountability: worker, request: { body: { id: WORK_ITEM_ID }, headers: {} } }),
      /request is invalid/u,
    );
    await assert.rejects(
      () => action({ database: fakeDatabase, accountability: worker, request: { body: { id: WORK_ITEM_ID }, headers: { "x-seo-worker-run": "x".repeat(129) } } }),
      /request is invalid/u,
    );
  }
});

test("draft rejects an unbounded section list before writing an article", async () => {
  const fakeDatabase = createFakeDatabase();
  const request = claimedRequest("run-a");
  request.body.sections = Array.from({ length: 51 }, (_, index) => ({ heading: `Heading ${index}`, body: `Body ${index}` }));
  await assert.rejects(
    () => createClaimedDraft({ database: fakeDatabase, accountability: worker, request }),
    /request is invalid/u,
  );
  assert.deepEqual(fakeDatabase.articleWrites, []);
  assert.equal(fakeDatabase.table("seo_work_items")[0].status, "processing");
});

test("draft endpoint supplies a valid UUID for the raw article insert", async () => {
  const fakeDatabase = createFakeDatabase();
  const insertError = await createClaimedDraft({
    database: fakeDatabase,
    accountability: worker,
    request: claimedRequest("run-a"),
  }).then(() => null, (error) => error);
  assert.equal(insertError, null);
  assert.match(fakeDatabase.articleWrites[0].id, UUID_PATTERN);
});

test("endpoint registers draft creation without an external completion route", () => {
  const paths = [];
  registerSeoFactoryEndpoint({ post: (path) => paths.push(path) }, {});
  assert.ok(paths.includes("/draft"));
  assert.ok(!paths.includes("/complete"));
  assert.ok(paths.every((path) => !path.startsWith("/items/")));
});

test("registered draft route preserves inherited Express request headers and body", async () => {
  const fakeDatabase = createFakeDatabase();
  const routes = new Map();
  registerSeoFactoryEndpoint({ post: (path, routeHandler) => routes.set(path, routeHandler) }, { database: fakeDatabase });

  const requestPrototype = Object.defineProperties({}, {
    accountability: { get: () => worker },
    body: { get: () => claimedRequest("run-a").body },
    headers: { get: () => ({ "x-seo-worker-run": "run-a" }) },
  });
  const request = Object.create(requestPrototype);
  let responseStatus;
  let responseBody;
  const response = {
    status(value) {
      responseStatus = value;
      return response;
    },
    json(value) {
      responseBody = value;
      return response;
    },
  };

  await routes.get("/draft")(request, response);

  assert.equal(responseStatus, undefined);
  assert.equal(responseBody.data.status, "draft_created");
  assert.equal(fakeDatabase.articleWrites.length, 1);
});
