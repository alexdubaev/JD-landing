// Task 13 (R9): deterministic per-record import plan.
//
// Given normalized input rows, the live product index and a profile, the
// planner assigns every row EXACTLY ONE outcome:
//   - "create-draft"        — SKU unknown: POST a new product with
//                             status "draft" (incoming status forced);
//   - "patch-minimal-diff"  — SKU known: PATCH ONLY the allowed fields
//                             whose value actually differs (possibly plus
//                             new analogs edges);
//   - "skip"                — nothing differs (idempotent re-run);
//   - "conflict"            — forbidden/invalid input; NO writes for the
//                             row, the reasons are recorded loudly.
//
// Forbidden fields are conflicts EVEN WHEN the value already matches the
// current one: a forbidden key present in the source is a source conflict
// by itself (ADR-003: never ignored silently).
//
// The planner is pure: same rows + same state + same profile always produce
// the same plans (row order = input order, field order = profile order).

import { canonicalKey } from "../migrations/reconcile-product-analogs.mjs";
import { normalizeCode } from "./normalize.mjs";
import { isRelationInput, isWritableField } from "./profiles.mjs";

export const PLAN_OUTCOMES = Object.freeze([
  "create-draft",
  "patch-minimal-diff",
  "skip",
  "conflict",
]);

const nullish = (value) => (value === undefined ? null : value);

const numberOrNaN = (value) => {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" ? parsed : Number.NaN;
};

/**
 * Field-aware value equality between an incoming normalized value and the
 * current live value (Directus returns decimals as strings and timestamps
 * with variable precision — both compare by parsed value).
 */
export function valuesEqual(field, incoming, current) {
  const left = nullish(incoming);
  const right = nullish(current);
  if (field === "price" || field === "weight") {
    if (left == null || right == null) return left === right;
    return numberOrNaN(left) === numberOrNaN(right);
  }
  if (field === "verified_at") {
    if (left == null || right == null) return left === right;
    return Date.parse(left) === Date.parse(right);
  }
  if (field === "gallery") {
    return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
  }
  return left === right;
}

const TIMESTAMP_FIELDS = new Set(["verified_at"]);

const canonicalTimestampValue = (value) => {
  if (typeof value !== "string") return value;
  const instant = Date.parse(value);
  return Number.isNaN(instant) ? value : new Date(instant).toISOString();
};

/**
 * Minimal diff of the allowed fields PRESENT in the row. Unchanged fields
 * never enter the patch — a full-payload PATCH is impossible by
 * construction.
 */
export function diffAllowedFields(profile, row, product) {
  const patch = {};
  const changedFields = [];
  const unchangedFields = [];
  for (const field of profile.fields) {
    if (!(field in row)) continue;
    if (valuesEqual(field, row[field], product?.[field])) {
      unchangedFields.push(field);
      continue;
    }
    // Timestamps enter the patch as canonical ISO instants so the diff is
    // stable regardless of the input's textual form ("2026-08-02" and
    // "2026-08-02T00:00:00.000Z" mean the same instant).
    patch[field] = canonicalTimestampValue(row[field]);
    changedFields.push(field);
  }
  return { patch, changedFields, unchangedFields };
}

/**
 * Keys of the row the profile may not process. `sku` is the identity key;
 * `status` is forced to draft on creates and is a conflict on existing
 * products (publication belongs to Publisher/Admin, ADR-003).
 */
export function forbiddenInputKeys(profile, row, { isNew }) {
  return Object.keys(row)
    .filter((key) => {
      if (key === "sku") return false;
      if (key === "status") return !isNew;
      return !isWritableField(profile, key) && !isRelationInput(profile, key);
    })
    .sort();
}

/**
 * Plans the products_analogs edges of one row: resolve target SKUs against
 * the live index, reject self-edges/unknown types/unknown targets loudly,
 * and skip edges whose canonical_key already exists (idempotent). The
 * caller passes a running `knownEdgeKeys` set so duplicate edges across
 * rows are planned exactly once.
 */
export function planAnalogEdges(
  row,
  product,
  { bySkuKey, knownEdgeKeys, relation },
) {
  if (!relation || !("analogs" in row)) {
    return { edges: [], conflicts: [] };
  }
  const conflicts = [];
  const edges = [];
  for (const analog of row.analogs ?? []) {
    const type = analog.relation_type;
    if (!relation.allowedTypes.includes(type)) {
      conflicts.push({
        code: "analog-invalid-type",
        detail: `relation_type "${type}" is not one of ${relation.allowedTypes.join(", ")}`,
      });
      continue;
    }
    const target = bySkuKey.get(normalizeCode(analog.sku));
    if (!target) {
      conflicts.push({
        code: "analog-target-missing",
        detail: `analog target sku does not exist (row sku ${row.sku})`,
      });
      continue;
    }
    if (String(target.id) === String(product.id)) {
      conflicts.push({ code: "analog-self-edge", detail: "analog target equals the row product" });
      continue;
    }
    const key = canonicalKey(product.id, target.id, type);
    if (knownEdgeKeys.has(key)) continue;
    knownEdgeKeys.add(key);
    edges.push({
      collection: relation.collection,
      product_from: String(product.id),
      product_to: String(target.id),
      relation_type: type,
      canonical_key: key,
      source_name: analog.source_name ?? relation.defaultSourceName,
      note: analog.note ?? null,
    });
  }
  return { edges, conflicts };
}

function planRow({ normalized, product, bySkuKey, knownEdgeKeys, profile }) {
  const base = {
    offset: normalized.offset,
    skuKey: normalized.skuKey,
    sku: normalized.row?.sku ?? null,
  };

  if (!normalized.ok) {
    return {
      ...base,
      outcome: "conflict",
      conflictCodes: normalized.errors.map(({ code }) => code),
      invalidReasons: normalized.errors,
      forbiddenFields: [],
    };
  }

  const row = normalized.row;
  const isNew = product == null;
  const forbiddenFields = forbiddenInputKeys(profile, row, { isNew });
  if (forbiddenFields.length > 0) {
    return {
      ...base,
      outcome: "conflict",
      forbiddenFields,
      conflictCodes: ["forbidden-fields"],
      invalidReasons: [],
    };
  }

  const relation = profile.relations.find(
    (candidate) => candidate.inputKey === "analogs",
  );

  if (isNew) {
    if (relation && Array.isArray(row.analogs) && row.analogs.length > 0) {
      return {
        ...base,
        outcome: "conflict",
        forbiddenFields: [],
        conflictCodes: ["analog-on-create-unsupported"],
        invalidReasons: [],
      };
    }
    // status is included ONLY when the row carried it (forced to draft);
    // the apply layer guarantees status=draft on the POST regardless.
    const createPayload = { sku: row.sku };
    if ("status" in row) createPayload.status = "draft";
    for (const field of profile.fields) {
      if (field in row) createPayload[field] = row[field];
    }
    return {
      ...base,
      outcome: "create-draft",
      createPayload,
      statusForcedToDraft:
        "status" in row && row.status !== null && row.status !== "draft",
      fields: Object.keys(createPayload)
        .filter((key) => key !== "status" && key !== "sku"),
    };
  }

  const { patch, changedFields, unchangedFields } = diffAllowedFields(
    profile,
    row,
    product,
  );
  const { edges, conflicts } = planAnalogEdges(row, product, {
    bySkuKey,
    knownEdgeKeys,
    relation,
  });
  if (conflicts.length > 0) {
    return {
      ...base,
      outcome: "conflict",
      productId: String(product.id),
      forbiddenFields: [],
      conflictCodes: conflicts.map(({ code }) => code),
      analogConflicts: conflicts,
      invalidReasons: [],
    };
  }

  if (changedFields.length === 0 && edges.length === 0) {
    return {
      ...base,
      outcome: "skip",
      productId: String(product.id),
      unchangedFields,
      changedFields,
      patch: {},
      edges: [],
    };
  }

  return {
    ...base,
    outcome: "patch-minimal-diff",
    productId: String(product.id),
    patch,
    changedFields,
    unchangedFields,
    edges,
  };
}

/**
 * Builds the full plan. `bySkuKey` maps normalized SKU keys to live product
 * rows; `edgeKeys` is the set of existing products_analogs canonical keys.
 */
export function buildPlans({ normalizedRows, bySkuKey, edgeKeys, profile }) {
  const knownEdgeKeys = new Set(edgeKeys ?? []);
  const plans = normalizedRows.map((normalized) =>
    planRow({
      normalized,
      product: normalized.skuKey ? bySkuKey.get(normalized.skuKey) : undefined,
      bySkuKey,
      knownEdgeKeys,
      profile,
    }),
  );

  const summary = {
    total: plans.length,
    create: plans.filter((plan) => plan.outcome === "create-draft").length,
    patch: plans.filter((plan) => plan.outcome === "patch-minimal-diff").length,
    skip: plans.filter((plan) => plan.outcome === "skip").length,
    conflict: plans.filter((plan) => plan.outcome === "conflict").length,
    statusForcedToDraft: plans.filter((plan) => plan.statusForcedToDraft).length,
    edgesPlanned: plans.reduce(
      (total, plan) => total + (plan.edges?.length ?? 0),
      0,
    ),
    forbiddenFieldRows: plans.filter(
      (plan) => (plan.forbiddenFields?.length ?? 0) > 0,
    ).length,
  };
  return { plans, summary };
}

/**
 * Redacts a plan entry for the release artifact: outcomes, field NAMES and
    counts only — never values, never SKUs.
 */
export function planArtifactEntry(plan) {
  const entry = {
    offset: plan.offset,
    outcome: plan.outcome,
  };
  if (plan.productId) entry.product_id = plan.productId;
  if (plan.fields?.length) entry.fields = [...plan.fields];
  if (plan.changedFields?.length) entry.fields = [...plan.changedFields];
  if (plan.forbiddenFields?.length) {
    entry.forbidden_fields = [...plan.forbiddenFields];
  }
  if (plan.conflictCodes?.length) entry.conflict_codes = [...plan.conflictCodes];
  if (plan.statusForcedToDraft) entry.forced_draft = true;
  if (plan.edges?.length) entry.edges_planned = plan.edges.length;
  return entry;
}
