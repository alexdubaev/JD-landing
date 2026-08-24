import assert from "node:assert/strict";
import test from "node:test";

import registerSeoFactoryEndpoint, * as seoFactory from "./directus-extension-seo-factory/dist/index.js";

const {
  claimApproved,
  createClaimedDraft,
  readPublishedInputs,
  releaseClaim,
  upsertShadowWorkItem,
} = seoFactory;

const worker = { role: "seo-worker" };
const WORK_ITEM_ID = "11111111-1111-4111-8111-111111111111";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function createFakeDatabase({
  workerRunId = "run-a",
  failArticleInsert = false,
  workItemExpiresAt = "2026-08-24T12:00:00.000Z",
  claimExpiresAt = "2026-08-24T12:00:00.000Z",
} = {}) {
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
      { id: WORK_ITEM_ID, status: "processing", worker_run_id: workerRunId, expires_at: workItemExpiresAt, article: null, last_error: null },
    ],
    seo_factory_claims: [
      { work_item_id: WORK_ITEM_ID, run_id: workerRunId, state: "processing", lease_until: claimExpiresAt, draft_id: null, last_error: null },
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
    const comparisons = [];
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
      andWhere(field, operator, value) {
        comparisons.push({ field, operator, value });
        return query;
      },
      forUpdate() {
        locks.push({ table, criteria: { ...criteria } });
        return query;
      },
      async first() {
        return (tables[table] ?? []).find((row) => matches(row));
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
          if (matches(row)) {
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

    function matches(row) {
      if (!Object.entries(criteria).every(([field, value]) => row[field] === value)) return false;
      return comparisons.every(({ field, operator, value }) => {
        if (operator !== ">") throw new Error(`unsupported comparison ${operator}`);
        return Date.parse(row[field]) > Date.parse(value);
      });
    }
    return query;
  }

  database.writes = writes;
  database.queries = queries;
  database.articleWrites = articleWrites;
  database.locks = locks;
  database.table = (name) => tables[name];
  database.fn = { now: () => "2026-08-24T11:00:00.000Z" };
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

function createClaimConflictDatabase({
  status = "approved",
  expiresAt = null,
  claimState = "retryable",
  claimExpiresAt = null,
} = {}) {
  const workItem = {
    id: WORK_ITEM_ID,
    status,
    expires_at: expiresAt,
    created_at: "2026-08-24T10:00:00.000Z",
  };
  const claim = {
    work_item_id: WORK_ITEM_ID,
    run_id: "previous-run",
    state: claimState,
    lease_until: claimExpiresAt,
    attempts: 2,
  };

  function database(table) {
    if (table === "seo_work_items") {
      let eligible = true;
      const query = {
        whereIn(field, values) {
          eligible &&= values.includes(workItem[field]);
          return query;
        },
        andWhere(callback) {
          let nestedResult = false;
          const nested = {
            whereNull(field) {
              nestedResult = workItem[field] === null || workItem[field] === undefined;
              return nested;
            },
            whereNot(field, value) {
              nestedResult = workItem[field] !== value;
              return nested;
            },
            orWhere(field, operator, value) {
              if (operator !== "<=") throw new Error(`unsupported comparison ${operator}`);
              nestedResult ||= Date.parse(workItem[field]) <= Date.parse(value);
              return nested;
            },
          };
          callback(nested);
          eligible &&= nestedResult;
          return query;
        },
        orderBy() { return query; },
        forUpdate() { return query; },
        skipLocked() { return query; },
        limit() { return query; },
        where() { return query; },
        async update(values) {
          Object.assign(workItem, values);
          return 1;
        },
        then(resolve, reject) {
          return Promise.resolve(eligible ? [workItem] : []).then(resolve, reject);
        },
      };
      return query;
    }

    if (table === "seo_factory_claims") {
      let criteria = {};
      const comparisons = [];
      const query = {
        where(values) {
          criteria = { ...criteria, ...values };
          return query;
        },
        andWhere(field, operator, value) {
          comparisons.push({ field, operator, value });
          return query;
        },
        forUpdate() { return query; },
        async first() {
          const criteriaMatch = Object.entries(criteria).every(([field, value]) => claim[field] === value);
          const comparisonsMatch = comparisons.every(({ field, operator, value }) => {
            if (operator !== "<=") throw new Error(`unsupported comparison ${operator}`);
            return Date.parse(claim[field]) <= Date.parse(value);
          });
          return criteriaMatch && comparisonsMatch ? claim : undefined;
        },
        insert() {
          return {
            onConflict() {
              return {
                async merge(values) {
                  if (values.attempts?.qualifiedExistingAttempts !== true) {
                    throw new Error('column reference "attempts" is ambiguous');
                  }
                  Object.assign(claim, values, { attempts: claim.attempts + 1 });
                },
              };
            },
          };
        },
      };
      return query;
    }

    throw new Error(`unexpected table ${table}`);
  }

  database.claim = claim;
  database.workItem = workItem;
  database.fn = { now: () => "2026-08-24T11:00:00.000Z" };
  database.raw = (sql, bindings) => {
    if (sql === "??.?? + 1" && bindings?.[0] === "seo_factory_claims" && bindings?.[1] === "attempts") {
      return { qualifiedExistingAttempts: true };
    }
    throw new Error('column reference "attempts" is ambiguous');
  };
  database.transaction = (action) => action(database);
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

test("queue inserts ready but conflict updates preserve the existing lifecycle", async () => {
  const fakeDatabase = createFakeDatabase();
  const result = await upsertShadowWorkItem({ database: fakeDatabase, accountability: worker, request: { body: recommendation } });
  assert.equal(result.status, "ready");
  assert.deepEqual(fakeDatabase.writes.map(({ table }) => table), ["seo_work_items"]);
  const { id: insertedId, ...insertData } = fakeDatabase.writes[0].data;
  const { id: mergedId, ...mergeData } = fakeDatabase.writes[0].update;
  assert.match(insertedId, UUID_PATTERN);
  assert.equal(mergedId, undefined);
  assert.deepEqual({ ...fakeDatabase.writes[0], data: insertData, update: mergeData }, {
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
    },
  });
});

test("queue endpoint supplies a server UUID for the raw work item insert", async () => {
  const fakeDatabase = createFakeDatabase();
  await upsertShadowWorkItem({ database: fakeDatabase, accountability: worker, request: { body: recommendation } });
  assert.match(fakeDatabase.writes[0].data.id, UUID_PATTERN);
  assert.equal(fakeDatabase.writes[0].update.id, undefined);
});

test("queue conflict updates preserve claim ownership fields", async () => {
  const fakeDatabase = createFakeDatabase();
  await upsertShadowWorkItem({
    database: fakeDatabase,
    accountability: worker,
    request: { body: { ...recommendation, worker_run_id: "new-recommendation-run" } },
  });
  assert.equal(fakeDatabase.writes[0].data.worker_run_id, "new-recommendation-run");
  assert.equal(fakeDatabase.writes[0].update.worker_run_id, undefined);
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

test("queue rejects JSON fields with the wrong top-level structures", async () => {
  const fakeDatabase = createFakeDatabase();
  for (const body of [
    { ...recommendation, current_value_json: [] },
    { ...recommendation, proposed_value_json: [] },
    { ...recommendation, patch_json: [] },
    { ...recommendation, evidence_json: {} },
    { ...recommendation, sources_json: {} },
    { ...recommendation, metrics_json: [] },
  ]) {
    await assert.rejects(
      () => upsertShadowWorkItem({ database: fakeDatabase, accountability: worker, request: { body } }),
      /request is invalid/u,
    );
  }
  assert.deepEqual(fakeDatabase.writes, []);
});

test("queue rejects JSON fields that exceed structure and nesting bounds", async () => {
  const fakeDatabase = createFakeDatabase();
  const tooManyEvidenceEntries = Array.from({ length: 101 }, (_, index) => ({ source: `source-${index}` }));
  const tooManyMetricKeys = Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`metric_${index}`, index]));
  let tooDeep = "leaf";
  for (let depth = 0; depth < 9; depth += 1) tooDeep = { nested: tooDeep };

  for (const body of [
    { ...recommendation, evidence_json: tooManyEvidenceEntries },
    { ...recommendation, metrics_json: tooManyMetricKeys },
    { ...recommendation, patch_json: tooDeep },
  ]) {
    await assert.rejects(
      () => upsertShadowWorkItem({ database: fakeDatabase, accountability: worker, request: { body } }),
      /request is invalid/u,
    );
  }
  assert.deepEqual(fakeDatabase.writes, []);
});

test("queue rejects broad JSON trees even when their serialized value is small", async () => {
  const fakeDatabase = createFakeDatabase();
  const tooManyNodes = Array.from(
    { length: 50 },
    () => Array.from({ length: 50 }, () => 0),
  );
  await assert.rejects(
    () => upsertShadowWorkItem({
      database: fakeDatabase,
      accountability: worker,
      request: { body: { ...recommendation, evidence_json: tooManyNodes } },
    }),
    /request is invalid/u,
  );
  assert.deepEqual(fakeDatabase.writes, []);
});

test("queue enforces per-field and aggregate serialized JSON byte caps", async () => {
  const fakeDatabase = createFakeDatabase();
  await assert.rejects(
    () => upsertShadowWorkItem({
      database: fakeDatabase,
      accountability: worker,
      request: { body: { ...recommendation, patch_json: { seo_title: "ж".repeat(40_000) } } },
    }),
    /request is invalid/u,
  );

  const chunk = "x".repeat(25_000);
  await assert.rejects(
    () => upsertShadowWorkItem({
      database: fakeDatabase,
      accountability: worker,
      request: {
        body: {
          ...recommendation,
          current_value_json: { value: chunk },
          proposed_value_json: { value: chunk },
          patch_json: { value: chunk },
          evidence_json: [{ value: chunk }],
          sources_json: [{ value: chunk }],
          metrics_json: { value: chunk },
        },
      },
    }),
    /request is invalid/u,
  );
  assert.deepEqual(fakeDatabase.writes, []);
});

test("claim conflict increments the existing qualified lease attempts value", async () => {
  const fakeDatabase = createClaimConflictDatabase();
  const claimError = await claimApproved({
    database: fakeDatabase,
    accountability: worker,
    request: { body: { limit: 1 }, headers: { "x-seo-worker-run": "run-a" } },
  }).then(() => null, (error) => error);
  assert.equal(claimError, null);
  assert.equal(fakeDatabase.claim.attempts, 3);
});

test("claim requires the bounded worker run header and ignores body run IDs", async () => {
  for (const headers of [{}, { "x-seo-worker-run": "x".repeat(129) }]) {
    const fakeDatabase = createClaimConflictDatabase();
    await assert.rejects(
      () => claimApproved({
        database: fakeDatabase,
        accountability: worker,
        request: { body: { limit: 1, runId: "body-run" }, headers },
      }),
      (error) => error?.code === "BAD_REQUEST",
    );
    assert.equal(fakeDatabase.workItem.status, "approved");
  }
});

test("claim transaction reclaims an expired processing lease", async () => {
  const fakeDatabase = createClaimConflictDatabase({
    status: "processing",
    expiresAt: "2026-08-24T10:00:00.000Z",
    claimState: "processing",
    claimExpiresAt: "2026-08-24T10:00:00.000Z",
  });
  const claimed = await claimApproved({
    database: fakeDatabase,
    accountability: worker,
    request: { body: { limit: 1 }, headers: { "x-seo-worker-run": "recovery-run" } },
  });
  assert.equal(claimed.length, 1);
  assert.equal(fakeDatabase.workItem.status, "processing");
  assert.equal(fakeDatabase.workItem.worker_run_id, "recovery-run");
  assert.equal(fakeDatabase.claim.run_id, "recovery-run");
  assert.equal(fakeDatabase.claim.attempts, 3);
});

test("claim does not steal an expired work item while its shadow lease remains active", async () => {
  const fakeDatabase = createClaimConflictDatabase({
    status: "processing",
    expiresAt: "2026-08-24T10:00:00.000Z",
    claimState: "processing",
    claimExpiresAt: "2026-08-24T12:00:00.000Z",
  });
  const claimed = await claimApproved({
    database: fakeDatabase,
    accountability: worker,
    request: { body: { limit: 1 }, headers: { "x-seo-worker-run": "recovery-run" } },
  });
  assert.deepEqual(claimed, []);
  assert.equal(fakeDatabase.workItem.worker_run_id, undefined);
  assert.equal(fakeDatabase.claim.run_id, "previous-run");
  assert.equal(fakeDatabase.claim.attempts, 2);
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
  assert.deepEqual(fakeDatabase.locks, [
    { table: "seo_work_items", criteria: { id: WORK_ITEM_ID, status: "processing", worker_run_id: "run-a" } },
    { table: "seo_factory_claims", criteria: { work_item_id: WORK_ITEM_ID, run_id: "run-a", state: "processing" } },
  ]);
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
    updated_at: "2026-08-24T11:00:00.000Z",
  });
});

test("draft and release reject a claim owned by another run", async () => {
  const fakeDatabase = createFakeDatabase();
  await assert.rejects(() => createClaimedDraft({ database: fakeDatabase, accountability: worker, request: claimedRequest("run-b") }), /claim not owned/u);
  await assert.rejects(() => releaseClaim({ database: fakeDatabase, accountability: worker, request: releaseRequest("run-b") }), /claim not owned/u);
  assert.deepEqual(fakeDatabase.articleWrites, []);
  assert.equal(fakeDatabase.table("seo_work_items")[0].status, "processing");
});

test("draft and release reject expired work-item and shadow claim leases", async () => {
  for (const action of [createClaimedDraft, releaseClaim]) {
    for (const leaseOptions of [
      { workItemExpiresAt: "2026-08-24T10:00:00.000Z" },
      { claimExpiresAt: "2026-08-24T10:00:00.000Z" },
    ]) {
      const fakeDatabase = createFakeDatabase(leaseOptions);
      const request = action === createClaimedDraft ? claimedRequest("run-a") : releaseRequest("run-a");
      await assert.rejects(
        () => action({ database: fakeDatabase, accountability: worker, request }),
        (error) => error?.code === "CONFLICT",
      );
      assert.deepEqual(fakeDatabase.articleWrites, []);
      assert.equal(fakeDatabase.table("seo_work_items")[0].status, "processing");
      assert.equal(fakeDatabase.table("seo_factory_claims")[0].state, "processing");
    }
  }
});

test("draft and release UUID-validate work item IDs before claim lookup", async () => {
  for (const action of [createClaimedDraft, releaseClaim]) {
    const fakeDatabase = createFakeDatabase();
    const request = action === createClaimedDraft ? claimedRequest("run-a") : releaseRequest("run-a");
    request.body.id = "not-a-uuid";
    await assert.rejects(
      () => action({ database: fakeDatabase, accountability: worker, request }),
      (error) => error?.code === "BAD_REQUEST",
    );
    assert.deepEqual(fakeDatabase.locks, []);
  }
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
