// seo-worker/src/work-items.mjs
//
// Control-plane logic for seo_work_items.
//
// Worker invariants enforced here (and proven by test/work-items.test.mjs):
//   1. disabled/shadow by default -> writes nothing.
//   2. draft-only -> the worker only ever emits status="draft". There is no
//      publish/promote code path here.
//   3. field allowlist -> a forbidden field is rejected loudly (never silent).
//   4. evidence -> recommendation without evidence is rejected.
//   5. stale hash -> mismatched before_hash => conflict, nothing applied.
//   6. dedupe -> an identical active recommendation is skipped (no duplicate).
//
// High-volume crawl telemetry is NOT written into seo_work_items; only the
// control-plane recommendation and its evidence/sources are stored.

import { createHash } from 'node:crypto';
import { isShadow } from './config.mjs';
import { validateEvidence } from './evidence.mjs';

export const WORK_ITEM_STATUS = Object.freeze({
  DRAFT: 'draft',
  READY: 'ready',
  REVIEW: 'review',
  APPLIED: 'applied',
  ROLLED_BACK: 'rolled_back',
  REJECTED: 'rejected',
  CONFLICT: 'conflict',
});

/** Statuses that count as "active" and therefore suppress a duplicate. */
const ACTIVE_STATUSES = new Set([
  WORK_ITEM_STATUS.DRAFT,
  WORK_ITEM_STATUS.READY,
  WORK_ITEM_STATUS.REVIEW,
  WORK_ITEM_STATUS.APPLIED,
]);

export const OUTCOMES = Object.freeze({
  SHADOW: 'shadow',
  REJECTED: 'rejected',
  CONFLICT: 'conflict',
  SKIPPED: 'skipped',
  CREATED: 'created',
});

const SEO_WORK_ITEMS_COLLECTION = 'seo_work_items';

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + stableStringify(value[k]))
      .join(',') +
    '}'
  );
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Hash of the entity's current field values (as seen by the analysis layer).
 * Used as `before_hash`. Deterministic and order-independent.
 *
 * @param {Record<string, unknown>} value
 * @returns {string}
 */
export function computeBeforeHash(value) {
  return sha256(stableStringify(value ?? null));
}

/**
 * Validate a proposed patch against an allowlist per entity type.
 *
 * @param {Record<string, string[]>} allowlist
 * @param {string} entityType
 * @param {Record<string, unknown>} patch
 * @returns {{allowed: string[], forbidden: string[], hasForbidden: boolean}}
 */
export function validatePatchFields(allowlist, entityType, patch) {
  const allowedForEntity = (allowlist && allowlist[entityType]) || [];
  const allowedSet = new Set(allowedForEntity);
  const allowed = [];
  const forbidden = [];
  for (const key of Object.keys(patch || {})) {
    if (allowedSet.has(key)) {
      allowed.push(key);
    } else {
      forbidden.push(key);
    }
  }
  return { allowed, forbidden, hasForbidden: forbidden.length > 0 };
}

/**
 * Deterministic dedupe key for a recommendation.
 *
 * Same entity + same recommendation type/subtype + same proposed patch => same
 * key, independent of object key ordering. Used as the unique `dedupe_key`.
 *
 * @param {{entity_type?: string, entity_key?: string, type?: string, subtype?: string, patch?: object}} input
 * @returns {string}
 */
export function computeDedupeKey(input) {
  const base = {
    entity_type: input.entity_type ?? null,
    entity_key: input.entity_key ?? null,
    type: input.type ?? null,
    subtype: input.subtype ?? null,
    patch: input.patch ?? null,
  };
  return sha256(stableStringify(base));
}

/**
 * Build a draft work item object from a validated input. Always status="draft".
 *
 * Pure helper; does not persist.
 *
 * @param {{input: any, allowlist: Record<string,string[]>, runId: string}} args
 * @returns {Record<string, unknown>}
 */
export function buildWorkItem({ input, allowlist, runId }) {
  const now = new Date().toISOString();
  const { allowed } = validatePatchFields(allowlist, input.entity_type, input.patch);
  const patchJson = {};
  for (const key of allowed) patchJson[key] = input.patch[key];

  return Object.freeze({
    type: input.type ?? null,
    subtype: input.subtype ?? null,
    status: WORK_ITEM_STATUS.DRAFT, // invariant 2: draft-only, always
    severity: input.severity ?? 'minor',
    priority_score: Number.isFinite(input.priority_score) ? input.priority_score : 0,
    confidence: Number.isFinite(input.confidence) ? input.confidence : 0,
    entity_type: input.entity_type ?? null,
    entity_id: input.entity_id ?? null,
    entity_key: input.entity_key ?? null,
    url: input.url ?? null,
    title: input.title ?? null,
    summary: input.summary ?? null,
    recommendation: input.recommendation ?? null,
    current_value_json: input.current_value ?? null,
    proposed_value_json: input.proposed_value ?? null,
    patch_json: patchJson,
    evidence_json: input.evidence ?? [],
    sources_json: input.sources ?? [],
    metrics_json: input.metrics ?? null,
    dedupe_key: computeDedupeKey(input),
    before_hash: input.before_hash ?? null,
    article: input.article ?? null,
    worker_run_id: runId,
    created_at: now,
    updated_at: now,
  });
}

/**
 * Create a seo_work_items draft row following all worker invariants.
 *
 * Decision order (each proven by a test):
 *   1. shadow             -> OUTCOMES.SHADOW (writes nothing)
 *   2. evidence invalid   -> OUTCOMES.REJECTED (invariant 4)
 *   3. forbidden field    -> OUTCOMES.REJECTED (invariant 3)
 *   4. stale before_hash  -> OUTCOMES.CONFLICT (invariant 5)
 *   5. duplicate active   -> OUTCOMES.SKIPPED (invariant 6)
 *   6. otherwise          -> OUTCOMES.CREATED with status="draft" (invariant 2)
 *
 * @param {{
 *   input: any,
 *   config: {enabled: boolean, dryRun: boolean, minEvidenceTier?: string, runId?: string},
 *   currentHash: string,
 *   allowlist: Record<string, string[]>,
 *   existingItems?: Array<{dedupe_key: string, status: string, id?: string}>,
 *   client?: {createItem: (collection: string, body: object) => Promise<object>}
 * }} args
 * @returns {Promise<{action: string, written: boolean, workItem?: object, existing?: object, reason?: string, forbidden?: string[], errors?: string[]}>}
 */
export async function createWorkItem({
  input,
  config,
  currentHash,
  allowlist,
  existingItems = [],
  client,
}) {
  // Invariant 1: disabled/shadow by default writes nothing.
  if (isShadow(config)) {
    return { action: OUTCOMES.SHADOW, written: false };
  }

  // Invariant 4: no recommendation without evidence (claim->source validated).
  const evidenceResult = validateEvidence({
    evidence: input.evidence,
    minTier: config.minEvidenceTier,
  });
  if (!evidenceResult.ok) {
    return {
      action: OUTCOMES.REJECTED,
      written: false,
      reason: 'evidence',
      errors: evidenceResult.errors,
    };
  }

  // Invariant 3: forbidden field is rejected loudly, never silently.
  const fieldCheck = validatePatchFields(allowlist, input.entity_type, input.patch);
  if (fieldCheck.hasForbidden) {
    return {
      action: OUTCOMES.REJECTED,
      written: false,
      reason: 'forbidden_field',
      forbidden: fieldCheck.forbidden,
    };
  }

  // Invariant 5: stale before_hash => conflict, nothing applied.
  if (input.before_hash !== currentHash) {
    return { action: OUTCOMES.CONFLICT, written: false, reason: 'stale_hash' };
  }

  // Invariant 6: dedupe an identical active recommendation.
  const dedupeKey = computeDedupeKey(input);
  const duplicate = (existingItems || []).find(
    (it) => it.dedupe_key === dedupeKey && ACTIVE_STATUSES.has(it.status),
  );
  if (duplicate) {
    return { action: OUTCOMES.SKIPPED, written: false, existing: duplicate };
  }

  // Invariant 2: create a draft-only work item.
  const workItem = buildWorkItem({
    input,
    allowlist,
    runId: config.runId,
  });

  if (client && typeof client.createItem === 'function') {
    const persisted = await client.createItem(SEO_WORK_ITEMS_COLLECTION, { ...workItem });
    return { action: OUTCOMES.CREATED, written: true, workItem: { ...workItem, ...persisted } };
  }

  return { action: OUTCOMES.CREATED, written: true, workItem };
}

/**
 * Claim a work item for a worker run (sets claimed_at/expires_at/worker_run_id).
 *
 * Idempotent-ish: a run may re-claim its own item, and an expired claim may be
 * taken over. An active claim held by a different run is reported "busy" and is
 * never stolen. In shadow mode nothing is written.
 *
 * @param {{
 *   workItem: {id: string},
 *   config: {enabled: boolean, dryRun: boolean},
 *   client: {getItem: (c:string,id:string)=>Promise<any>, updateItem: (c:string,id:string,b:object)=>Promise<any>},
 *   runId: string,
 *   ttlMs?: number
 * }} args
 */
export async function claimWorkItem({ workItem, config, client, runId, ttlMs = 300_000 }) {
  if (isShadow(config)) {
    return { action: OUTCOMES.SHADOW, written: false };
  }

  const current = await client.getItem(SEO_WORK_ITEMS_COLLECTION, workItem.id);
  const now = Date.now();
  const expiresAt = current?.expires_at ? Date.parse(current.expires_at) : NaN;

  const heldByOther =
    current?.worker_run_id &&
    current.worker_run_id !== runId &&
    Number.isFinite(expiresAt) &&
    expiresAt > now;

  if (heldByOther) {
    return { action: 'busy', written: false };
  }

  const claimedAt = new Date(now).toISOString();
  const newExpiresAt = new Date(now + ttlMs).toISOString();
  const body = { worker_run_id: runId, claimed_at: claimedAt, expires_at: newExpiresAt };
  await client.updateItem(SEO_WORK_ITEMS_COLLECTION, workItem.id, body);
  return { action: 'claimed', written: true, claimed_at: claimedAt, expires_at: newExpiresAt };
}
