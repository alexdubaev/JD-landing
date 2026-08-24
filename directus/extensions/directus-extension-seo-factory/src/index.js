const CLAIMABLE = ["approved", "retryable"];

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

function handler(action, context) {
  return async (request, response) => {
    try {
      const result = await action({ ...context, accountability: request.accountability }, { ...request, context });
      response.json({ data: result });
    } catch (error) {
      response.status(error.code === "FORBIDDEN" ? 403 : 500).json({ error: error.code === "FORBIDDEN" ? "forbidden" : "claim_failed" });
    }
  };
}

export default function registerSeoFactoryEndpoint(router, context) {
  router.post("/claim", handler((ctx, request) => claimApproved({ ...ctx, request }), context));
  router.post("/release", handler((ctx, request) => releaseClaim({ ...ctx, request }), context));
  router.post("/complete", handler((ctx, request) => completeClaim({ ...ctx, request }), context));
}
