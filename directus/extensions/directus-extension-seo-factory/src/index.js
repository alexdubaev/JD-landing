const CLAIMABLE = ["approved", "retryable"];
const PUBLISHED_SOURCE_FIELDS = ["id", "status", "slug", "title", "seo_title", "seo_description"];
const PUBLISHED_SOURCE_COLLECTIONS = ["products", "categories", "pages"];
const ALLOWED_ENTITY_TYPES = new Set(PUBLISHED_SOURCE_COLLECTIONS);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const STRING_CAPS = {
  type: 128,
  subtype: 128,
  severity: 32,
  entity_id: 128,
  entity_key: 255,
  url: 255,
  title: 255,
  summary: 4000,
  recommendation: 8000,
  dedupe_key: 255,
  before_hash: 128,
  worker_run_id: 128,
};
const JSON_FIELDS = ["current_value_json", "proposed_value_json", "patch_json", "evidence_json", "sources_json", "metrics_json"];

function requireWorkerRole(accountability) {
  const expected = process.env.SEO_FACTORY_WORKER_ROLE_ID;
  if (!expected || accountability?.role !== expected) {
    const error = new Error("SEO Factory worker role is not authorized");
    error.code = "FORBIDDEN";
    throw error;
  }
}

function boundedLimit(value) {
  const parsed = Number.parseInt(String(value ?? "10"), 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 100) : 10;
}

function invalidRequest() {
  const error = new Error("SEO Factory request is invalid");
  error.code = "BAD_REQUEST";
  return error;
}

function requestedLimit(value) {
  const parsed = Number(value ?? 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) throw invalidRequest();
  return parsed;
}

function cappedString(value, maximum) {
  if (value === undefined || value === null) return undefined;
  return String(value).trim().slice(0, maximum);
}

function databaseInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= -2147483648 && parsed <= 2147483647;
}

function databaseDecimal54(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    && Math.abs(parsed) <= 9.9999
    && /^-?\d(?:\.\d{1,4})?$/u.test(String(value));
}

function allowlistedRecommendation(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw invalidRequest();
  const dedupeKey = cappedString(body.dedupe_key, STRING_CAPS.dedupe_key);
  const entityType = cappedString(body.entity_type, 64);
  if (!dedupeKey || !ALLOWED_ENTITY_TYPES.has(entityType)) throw invalidRequest();
  if (body.entity_id !== undefined && body.entity_id !== null && !UUID_PATTERN.test(String(body.entity_id))) throw invalidRequest();

  const workItem = { dedupe_key: dedupeKey, entity_type: entityType, status: "ready" };
  for (const [field, maximum] of Object.entries(STRING_CAPS)) {
    if (field === "dedupe_key") continue;
    const value = cappedString(body[field], maximum);
    if (value !== undefined) workItem[field] = value;
  }
  if (body.priority_score !== undefined && body.priority_score !== null) {
    if (!databaseInteger(body.priority_score)) throw invalidRequest();
    workItem.priority_score = Number(body.priority_score);
  }
  if (body.confidence !== undefined && body.confidence !== null) {
    if (!databaseDecimal54(body.confidence)) throw invalidRequest();
    workItem.confidence = Number(body.confidence);
  }
  for (const field of JSON_FIELDS) {
    if (body[field] !== undefined) workItem[field] = body[field];
  }
  return workItem;
}

function runId(request) {
  return String(request.body?.runId || request.headers["x-seo-worker-run"] || "worker").slice(0, 128);
}

export const claimApproved = ({ database, accountability, request }) => database.transaction(async (trx) => {
  requireWorkerRole(accountability);
  const now = new Date();
  const leaseMs = Math.min(Math.max(Number(request.body?.leaseMs || 300000), 30000), 1800000);
  const leaseUntil = new Date(now.getTime() + leaseMs);
  const rows = await trx("seo_work_items")
    .whereIn("status", CLAIMABLE)
    .andWhere((query) => query.whereNull("expires_at").orWhere("expires_at", "<=", trx.fn.now()))
    .orderBy("created_at", "asc")
    .forUpdate()
    .skipLocked()
    .limit(boundedLimit(request.body?.limit));
  const claimed = [];
  for (const row of rows) {
    await trx("seo_factory_claims")
      .insert({ work_item_id: row.id, run_id: runId(request), state: "processing", lease_until: leaseUntil, attempts: 1, updated_at: now })
      .onConflict("work_item_id")
      .merge({ run_id: runId(request), state: "processing", lease_until: leaseUntil, attempts: trx.raw("?? + 1", ["attempts"]), updated_at: now, last_error: null });
    await trx("seo_work_items").where({ id: row.id }).update({ status: "processing", worker_run_id: runId(request), claimed_at: now, expires_at: leaseUntil, last_error: null });
    claimed.push({ ...row, status: "processing", worker_run_id: runId(request), expires_at: leaseUntil.toISOString() });
  }
  return claimed;
});

export const releaseClaim = ({ database, accountability, request }) => database.transaction(async (trx) => {
  requireWorkerRole(accountability);
  const id = request.body?.id;
  if (!id) return null;
  const error = String(request.body?.error || "draft creation failed").slice(0, 2000);
  await trx("seo_work_items").where({ id }).update({ status: "retryable", expires_at: null, last_error: error });
  await trx("seo_factory_claims").where({ work_item_id: id }).update({ state: "retryable", lease_until: null, last_error: error, updated_at: trx.fn.now() });
  return { id, status: "retryable" };
});

export const completeClaim = ({ database, accountability, request }) => database.transaction(async (trx) => {
  requireWorkerRole(accountability);
  const id = request.body?.id;
  const draftId = request.body?.draftId;
  if (!id || !draftId) return null;
  await trx("seo_work_items").where({ id }).update({ status: "draft_created", article: draftId, expires_at: null, last_error: null });
  await trx("seo_factory_claims").where({ work_item_id: id }).update({ state: "draft_created", draft_id: draftId, lease_until: null, updated_at: trx.fn.now() });
  return { id, status: "draft_created", article: draftId };
});

export const readPublishedInputs = async ({ database, accountability, request }) => {
  requireWorkerRole(accountability);
  const limit = requestedLimit(request.body?.limit);
  const rows = await Promise.all(
    PUBLISHED_SOURCE_COLLECTIONS.map((collection) => database(collection)
      .select(...PUBLISHED_SOURCE_FIELDS)
      .where({ status: "published" })
      .limit(limit)),
  );
  return Object.fromEntries(PUBLISHED_SOURCE_COLLECTIONS.map((collection, index) => [collection, rows[index]]));
};

export const upsertShadowWorkItem = async ({ database, accountability, request }) => {
  requireWorkerRole(accountability);
  const workItem = allowlistedRecommendation(request.body);
  await database("seo_work_items")
    .insert(workItem)
    .onConflict("dedupe_key")
    .merge(workItem);
  return { dedupe_key: workItem.dedupe_key, status: "ready" };
};

function handler(action, context, failure = "claim_failed") {
  return async (request, response) => {
    try {
      const result = await action({ ...context, accountability: request.accountability }, { ...request, context });
      response.json({ data: result });
    } catch (error) {
      const status = error.code === "FORBIDDEN" ? 403 : error.code === "BAD_REQUEST" ? 400 : 500;
      response.status(status).json({ error: error.code === "FORBIDDEN" ? "forbidden" : failure });
    }
  };
}

export default function registerSeoFactoryEndpoint(router, context) {
  router.post("/claim", handler((ctx, request) => claimApproved({ ...ctx, request }), context));
  router.post("/release", handler((ctx, request) => releaseClaim({ ...ctx, request }), context));
  router.post("/complete", handler((ctx, request) => completeClaim({ ...ctx, request }), context));
  router.post("/inputs", handler((ctx, request) => readPublishedInputs({ ...ctx, request }), context, "request_failed"));
  router.post("/work-items/upsert", handler((ctx, request) => upsertShadowWorkItem({ ...ctx, request }), context, "request_failed"));
}
