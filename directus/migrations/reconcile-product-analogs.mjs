// Task 12 (R8) reconciliation: proves the products_analogs state. The
// collection starts EMPTY (edges are added later by editors and/or the
// importer), so zero rows is a VALID outcome.
//
// Per stored row:
// - validateAnalogEdge passes: no self-edge, a known relation_type, and a
//   canonical_key that matches the recomputation from (from, to, type);
// - no duplicate canonical_key exists (two physical rows sharing one key);
// - symmetric types (analog/oem_cross/compatible) have no mirror rows: the
//   raw (from, to) pair never appears reversed with the same type — the
//   sorted canonical key makes mirrors physically impossible once the
//   operator-run SQL constraints are applied;
// - both endpoints exist AND are published (code-phase check; DB-level FKs
//   only guarantee existence).
//
// Summary counts: rows by relation type plus every violation class. Pure
// checks + thin CLI; no writes.

import { DirectusAdminClient, isMainModule } from "../schema/apply-schema.mjs";

export const ANALOGS_COLLECTION = "products_analogs";
export const PRODUCTS_COLLECTION = "products";

export const RELATION_TYPES = [
  "analog",
  "oem_cross",
  "compatible",
  "superseded_by",
];

/** Logically bidirectional types: the canonical key sorts the id pair. */
export const SYMMETRIC_RELATION_TYPES = ["analog", "oem_cross", "compatible"];

const ROWS_SCAN_LIMIT = 100;
const MAX_SCAN_PAGES = 500;
const PRODUCT_LOOKUP_CHUNK = 100;

const relationId = (value) =>
  typeof value === "string" ? value : (value?.id ?? null);

/**
 * Deterministic edge key `<type>:<from>:<to>`. Symmetric types sort the pair
 * (so A->B and B->A share one key and a mirror duplicate becomes impossible
 * under the unique constraint); superseded_by keeps the stored direction.
 */
export function canonicalKey(productFrom, productTo, relationType) {
  const from = String(productFrom);
  const to = String(productTo);
  const [left, right] =
    SYMMETRIC_RELATION_TYPES.includes(relationType) && from > to
      ? [to, from]
      : [from, to];
  return `${relationType}:${left}:${right}`;
}

/**
 * Pure edge validation: no self-edge, a known relation_type, and a
 * canonical_key that matches the recomputation.
 */
export function validateAnalogEdge({
  product_from,
  product_to,
  relation_type,
  canonical_key,
} = {}) {
  const errors = [];
  const from = relationId(product_from);
  const to = relationId(product_to);

  if (!from) errors.push("product_from is required");
  if (!to) errors.push("product_to is required");
  if (!RELATION_TYPES.includes(relation_type)) {
    errors.push(`unknown relation_type ${JSON.stringify(relation_type)}`);
  }
  if (from && to && from === to) {
    errors.push(`self-edge: product_from equals product_to (${from})`);
  }
  if (
    from &&
    to &&
    RELATION_TYPES.includes(relation_type) &&
    canonical_key !== canonicalKey(from, to, relation_type)
  ) {
    errors.push(
      `canonical_key ${JSON.stringify(canonical_key)} does not match the recomputed ` +
        `${JSON.stringify(canonicalKey(from, to, relation_type))}`,
    );
  }

  return { ok: errors.length === 0, errors };
}

const rowsScanQuery = (page) =>
  new URLSearchParams({
    fields: "id,product_from,product_to,relation_type,canonical_key",
    sort: "id",
    limit: String(ROWS_SCAN_LIMIT),
    page: String(page),
  });

export async function reconcileProductAnalogs(client) {
  const violations = [];

  // Bounded paged scan of every products_analogs row (never limit=-1).
  const rows = [];
  let scanPages = 0;
  for (let page = 1; page <= MAX_SCAN_PAGES; page += 1) {
    const batch = await client.request(
      `/items/${ANALOGS_COLLECTION}?${rowsScanQuery(page).toString()}`,
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    scanPages = page;
    rows.push(...batch);
    if (batch.length < ROWS_SCAN_LIMIT) break;
  }

  const summary = {
    rowsTotal: rows.length,
    scanPages,
    byType: { analog: 0, oem_cross: 0, compatible: 0, superseded_by: 0 },
    duplicateCanonicalKeys: 0,
    selfEdges: 0,
    unknownRelationTypes: 0,
    canonicalKeyMismatches: 0,
    mirrorRows: 0,
    orphanEdges: 0,
    unpublishedEndpoints: 0,
  };

  const canonicalCounts = new Map();
  const rawPairs = new Set();
  const referencedIds = new Set();

  for (const row of rows) {
    const validation = validateAnalogEdge(row);
    if (!validation.ok) {
      violations.push({ code: "invalid-edge", id: row?.id, errors: validation.errors });
      for (const error of validation.errors) {
        if (error.startsWith("self-edge")) summary.selfEdges += 1;
        else if (error.startsWith("unknown relation_type")) summary.unknownRelationTypes += 1;
        else if (error.startsWith("canonical_key")) summary.canonicalKeyMismatches += 1;
      }
    }
    if (RELATION_TYPES.includes(row?.relation_type)) {
      summary.byType[row.relation_type] += 1;
    }
    if (row?.canonical_key != null) {
      canonicalCounts.set(row.canonical_key, (canonicalCounts.get(row.canonical_key) ?? 0) + 1);
    }

    const from = relationId(row?.product_from);
    const to = relationId(row?.product_to);
    if (from && to && RELATION_TYPES.includes(row?.relation_type)) {
      rawPairs.add(`${row.relation_type}|${from}|${to}`);
    }
    for (const id of [from, to]) {
      if (id) referencedIds.add(id);
    }
  }

  for (const [key, count] of canonicalCounts) {
    if (count > 1) {
      violations.push({
        code: "duplicate-canonical-key",
        canonical_key: key,
        count,
      });
      summary.duplicateCanonicalKeys += count - 1;
    }
  }

  // Mirror check: for symmetric types the reversed raw pair must never be
  // stored as its own row (structurally the duplicate-key check above, but
  // reported separately so the operator sees the direction bug).
  for (const row of rows) {
    const type = row?.relation_type;
    if (!SYMMETRIC_RELATION_TYPES.includes(type)) continue;
    const from = relationId(row?.product_from);
    const to = relationId(row?.product_to);
    if (from && to && from !== to && rawPairs.has(`${type}|${to}|${from}`)) {
      violations.push({
        code: "mirror-row",
        id: row?.id,
        detail: `${type} ${from} -> ${to} mirrors the stored ${to} -> ${from}`,
      });
      summary.mirrorRows += 1;
    }
  }

  // Orphan check: both endpoints must exist AND be published. The lookups are
  // chunked and bounded (never limit=-1).
  const liveProducts = new Map();
  const ids = [...referencedIds];
  for (let offset = 0; offset < ids.length; offset += PRODUCT_LOOKUP_CHUNK) {
    const chunk = ids.slice(offset, offset + PRODUCT_LOOKUP_CHUNK);
    const query = new URLSearchParams({
      "filter[id][_in]": chunk.join(","),
      fields: "id,status",
      limit: String(chunk.length),
    });
    const found = await client.request(
      `/items/${PRODUCTS_COLLECTION}?${query.toString()}`,
    );
    for (const product of Array.isArray(found) ? found : []) {
      liveProducts.set(product.id, product.status);
    }
  }

  for (const row of rows) {
    for (const side of ["product_from", "product_to"]) {
      const id = relationId(row?.[side]);
      if (!id) continue;
      if (!liveProducts.has(id)) {
        violations.push({
          code: "orphan-edge",
          id: row?.id,
          detail: `${side} ${id} has no products row`,
        });
        summary.orphanEdges += 1;
      } else if (liveProducts.get(id) !== "published") {
        violations.push({
          code: "unpublished-endpoint",
          id: row?.id,
          detail: `${side} ${id} is ${liveProducts.get(id)}, not published`,
        });
        summary.unpublishedEndpoints += 1;
      }
    }
  }

  return { ok: violations.length === 0, violations, summary };
}

async function main() {
  const client = await DirectusAdminClient.connectFromEnvironment();
  const result = await reconcileProductAnalogs(client);

  const s = result.summary;
  console.log(
    `Reconciled ${s.rowsTotal} products_analogs row(s) in ${s.scanPages} scan page(s): ` +
      `analog ${s.byType.analog}, oem_cross ${s.byType.oem_cross}, ` +
      `compatible ${s.byType.compatible}, superseded_by ${s.byType.superseded_by}.`,
  );
  if (!result.ok) {
    console.error(`Reconciliation FAILED with ${result.violations.length} violation(s):`);
    for (const violation of result.violations) {
      const detail =
        violation.errors?.join("; ") ?? violation.detail ??
        `count ${violation.count ?? ""}`.trim();
      console.error(`- [${violation.code}] ${violation.id ?? violation.canonical_key ?? ""}: ${detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log("Reconciliation OK.");
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
