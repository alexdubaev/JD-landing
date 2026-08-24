import path from "node:path";

import { DirectusAdminClient, isMainModule } from "../schema/apply-schema.mjs";
import {
  assertArtifactDirectory,
  assertSafeArtifact,
  writeArtifactsExclusive,
} from "../releases/lib/artifacts.mjs";

/**
 * Task 10 (R6): backfill the indexed SKU/OEM search keys.
 *
 * What this migration does:
 * - pages through ALL products (500 per page, deterministic `sort=id`) and
 *   writes ONLY `products.sku_normalized` / `products.mpn_normalized`;
 * - the normalized value is derived from the untouched source fields
 *   (`sku` / `mpn`): uppercase, trim, strip every non-alphanumeric character
 *   (the same derivation the deere-shop-search endpoint applies to queries);
 * - a source field that is empty (or normalizes to an empty string) is never
 *   written and an existing normalized value is never cleared;
 * - already-current rows are skipped, so an interrupted apply is RESUMABLE
 *   and a fully backfilled instance reports a clean no-op.
 *
 * What this migration does NOT do:
 * - it does NOT create the schema — `npm run schema:apply` owns the
 *   `product_codes` collection and the two hidden normalized fields;
 * - it does NOT create `product_codes` rows (no feed contract yet, ADR-003);
 * - it does NOT create the B-tree indexes / the composite unique constraint —
 *   those are operator-run SQL (sql/product-search-indexes-up.sql), because
 *   the Directus REST API cannot execute raw SQL.
 *
 * Modes:
 * - default (--dry-run): read-only plan with per-page statistics; STOP before
 *   any write when a precondition fails.
 * - --apply --release-id=<id>: per-item PATCHes of the two normalized fields
 *   only. sku, mpn and every other products field are read-only here.
 */

export const PRODUCTS_COLLECTION = "products";
export const PAGE_SIZE = 500;
export const MAX_PAGES = 200;
export const NORMALIZED_FIELD_PAIRS = { sku: "sku_normalized", mpn: "mpn_normalized" };

export const EXPECTED_AFTER = {
  patchTotal: 0,
  pendingSkuWrites: 0,
  pendingMpnWrites: 0,
};

/**
 * The shared normalization contract: uppercase, trim, and collapse every
 * non-alphanumeric character (runs collapse into nothing, matching the
 * legacy frontend `normalizeSku` behaviour). Identical logic lives in the
 * deere-shop-search endpoint so stored keys and query keys always agree.
 */
export function normalizeCode(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

const isFilled = (value) =>
  typeof value === "string" && value.trim() !== "";

/**
 * Pure per-row decision: which normalized fields (if any) must be written.
 * Returns null for a no-op row (empty source, empty derivation, or the
 * stored copy already current — the resumable case).
 */
export function buildNormalizedPatch(product) {
  const patch = {};
  for (const [sourceField, normalizedField] of Object.entries(NORMALIZED_FIELD_PAIRS)) {
    const source = product?.[sourceField];
    if (!isFilled(source)) continue;
    const normalized = normalizeCode(source);
    if (normalized === "") continue;
    if (product?.[normalizedField] === normalized) continue;
    patch[normalizedField] = normalized;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Reads the current schema state needed by the preconditions. Read-only.
 */
export async function collectBackfillState(client) {
  const collections = await client.request("/collections");
  const collectionNames = new Set(
    collections.map(({ collection }) => collection),
  );
  const hasProducts = collectionNames.has(PRODUCTS_COLLECTION);
  const productFields = hasProducts
    ? await client.request(`/fields/${PRODUCTS_COLLECTION}`)
    : [];
  const productFieldNames = new Set(
    (productFields ?? []).map(({ field }) => field),
  );
  return {
    collectionNames,
    hasProducts,
    productFieldNames,
    missingNormalizedFields: Object.values(NORMALIZED_FIELD_PAIRS).filter(
      (field) => !productFieldNames.has(field),
    ),
  };
}

/**
 * Pure evaluation of the STOP preconditions.
 */
export function evaluateBackfillState(state) {
  const blockers = [];
  if (!state.hasProducts) {
    blockers.push({
      code: "missing-collection",
      detail: `required collection ${PRODUCTS_COLLECTION} not found`,
    });
  }
  for (const field of state.missingNormalizedFields) {
    blockers.push({
      code: "missing-normalized-field",
      detail: `${PRODUCTS_COLLECTION}.${field} not found — run npm run schema:apply first`,
    });
  }
  return { ok: blockers.length === 0, blockers };
}

const productPageQuery = (page, pageSize) =>
  new URLSearchParams({
    fields: "id,sku,mpn,sku_normalized,mpn_normalized",
    sort: "id",
    limit: String(pageSize),
    page: String(page),
  });

/**
 * Orchestrates the backfill. Default mode is a dry run (no writes). `apply`
 * requires a `releaseId`; a stopped result performs no writes even in apply
 * mode. Every write is a per-item PATCH awaited before the next one, so a
 * failed apply can simply be rerun (already-current rows are skipped).
 */
export async function runProductSearchBackfill(
  client,
  { apply = false, releaseId = null, pageSize = PAGE_SIZE } = {},
) {
  if (apply && !releaseId) {
    throw new Error("--apply requires --release-id=<id>");
  }

  const state = await collectBackfillState(client);
  const evaluation = evaluateBackfillState(state);
  if (!evaluation.ok) {
    return {
      ok: false,
      stopped: true,
      applied: false,
      noop: false,
      releaseId,
      migration: "backfill-product-search",
      blockers: evaluation.blockers,
      report: [],
      summary: { pageSize, pages: 0, productsTotal: 0 },
      expectedAfter: EXPECTED_AFTER,
    };
  }

  const summary = {
    pageSize,
    pages: 0,
    productsTotal: 0,
    skuFilled: 0,
    mpnFilled: 0,
    emptySource: 0,
    alreadyCurrent: 0,
    pendingSkuWrites: 0,
    pendingMpnWrites: 0,
    patchTotal: 0,
  };
  const report = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const products = await client.request(
      `/items/${PRODUCTS_COLLECTION}?${productPageQuery(page, pageSize).toString()}`,
    );
    if (!Array.isArray(products) || products.length === 0) break;
    summary.pages = page;
    summary.productsTotal += products.length;

    let pageSkuWrites = 0;
    let pageMpnWrites = 0;
    let pagePatches = 0;
    for (const product of products) {
      const skuFilled = isFilled(product?.sku);
      const mpnFilled = isFilled(product?.mpn);
      if (skuFilled) summary.skuFilled += 1;
      if (mpnFilled) summary.mpnFilled += 1;
      if (!skuFilled && !mpnFilled) summary.emptySource += 1;

      const patch = buildNormalizedPatch(product);
      if (!patch) {
        if (skuFilled || mpnFilled) summary.alreadyCurrent += 1;
        continue;
      }
      if (patch.sku_normalized !== undefined) {
        summary.pendingSkuWrites += 1;
        pageSkuWrites += 1;
      }
      if (patch.mpn_normalized !== undefined) {
        summary.pendingMpnWrites += 1;
        pageMpnWrites += 1;
      }
      summary.patchTotal += 1;
      pagePatches += 1;

      if (apply) {
        // ONLY the two derived fields are patched — sku/mpn and every other
        // products field stays untouched (ADR-003 source-of-truth rules).
        await client.request(
          `/items/${PRODUCTS_COLLECTION}/${encodeURIComponent(product.id)}`,
          { method: "PATCH", body: JSON.stringify(patch) },
        );
      }
    }

    report.push({
      action: apply ? "patch page" : "scan page",
      page,
      scanned: products.length,
      patches: pagePatches,
      skuWrites: pageSkuWrites,
      mpnWrites: pageMpnWrites,
    });

    if (products.length < pageSize) break;
    if (page === MAX_PAGES) {
      return {
        ok: false,
        stopped: true,
        applied: false,
        noop: false,
        releaseId,
        migration: "backfill-product-search",
        blockers: [{
          code: "page-limit-exceeded",
          detail: `stopped after MAX_PAGES=${MAX_PAGES} pages — rerun after investigating`,
        }],
        report,
        summary,
        expectedAfter: EXPECTED_AFTER,
      };
    }
  }

  return {
    ok: true,
    stopped: false,
    applied: apply,
    noop: summary.patchTotal === 0,
    releaseId,
    migration: "backfill-product-search",
    blockers: [],
    report,
    summary,
    expectedAfter: EXPECTED_AFTER,
  };
}

const argumentValue = (name, args = process.argv.slice(2)) => {
  const prefix = `--${name}=`;
  return args.find((value) => value.startsWith(prefix))?.slice(prefix.length);
};

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const releaseId = argumentValue("release-id", args) ?? null;
  const outputDirectory = argumentValue("output", args) ?? null;

  const client = await DirectusAdminClient.connectFromEnvironment();
  const result = await runProductSearchBackfill(client, { apply, releaseId });

  if (outputDirectory) {
    const repositoryRoot = path.resolve(import.meta.dirname, "../..");
    const directory = await assertArtifactDirectory(outputDirectory, {
      repositoryRoot,
      scanExistingFiles: true,
    });
    const artifact = assertSafeArtifact({
      migration: "backfill-product-search",
      mode: apply ? "apply" : "dry-run",
      releaseId,
      ...result,
    });
    await writeArtifactsExclusive(directory, {
      "product-search-backfill-plan.json": artifact,
    });
    console.log(
      `Wrote backfill plan to ${path.join(directory, "product-search-backfill-plan.json")}`,
    );
  }

  if (result.stopped) {
    console.error(
      `STOP: ${result.blockers.length} blocker(s) prevented the product search backfill:`,
    );
    for (const blocker of result.blockers) {
      console.error(`- [${blocker.code}] ${blocker.detail}`);
    }
    process.exitCode = 1;
    return;
  }

  if (result.noop) {
    console.log(
      "Product search keys are already backfilled — nothing to do " +
        `(${result.summary.productsTotal} products scanned).`,
    );
    return;
  }

  const verb = apply ? "Applied" : "Planned";
  const s = result.summary;
  console.log(
    `${verb} the product search backfill: ${s.patchTotal} patch(es) over ${s.productsTotal} product(s) in ${s.pages} page(s) of ${s.pageSize}.`,
  );
  console.log(
    `- sku filled: ${s.skuFilled}, mpn filled: ${s.mpnFilled}, empty source: ${s.emptySource}, already current: ${s.alreadyCurrent}`,
  );
  console.log(
    `- pending writes: sku ${s.pendingSkuWrites}, mpn ${s.pendingMpnWrites}`,
  );
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
