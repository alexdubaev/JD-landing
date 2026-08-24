import { createHash } from "node:crypto";
import path from "node:path";
import { open } from "node:fs/promises";

import { DirectusAdminClient, isMainModule } from "../schema/apply-schema.mjs";
import {
  assertArtifactDirectory,
  assertSafeArtifact,
  writeArtifactsExclusive,
} from "../releases/lib/artifacts.mjs";

/**
 * Task 11 (R7B): convert the legacy `products.gallery` JSON references into
 * canonical `product_images` rows.
 *
 * Per gallery product (non-empty legacy gallery):
 * - the FIRST reference is the main-image slot: `products.main_image` is
 *   PATCHed to it ONLY when main_image is currently null — an existing
 *   main_image value is NEVER modified;
 * - the REMAINING references become product_images rows with sort_order equal
 *   to their position in the original JSON array;
 * - rows whose (product, image) pair already exists are skipped, so an
 *   interrupted apply is RESUMABLE and a completed run reports a clean no-op;
 * - duplicate references inside one gallery are skipped (the frontend gallery
 *   deduplicates by image id anyway).
 *
 * What this migration does NOT do:
 * - it does NOT touch the legacy gallery/specifications/documents JSON values;
 * - it does NOT touch product status, prices or any other products field;
 * - it does NOT create, modify or delete Files;
 * - it does NOT change schema (npm run schema:apply owns the collections).
 *
 * Guard: the operator passes the baseline product count from the release plan
 * (`--expected-products=283`); the migration STOPs before any write when the
 * live count differs. The number is never hardcoded here.
 *
 * Modes:
 * - default (--dry-run): read-only plan with statistics and the before-state
 *   NDJSON (product_id, gallery_sha256, main_image). Capture the artifacts
 *   BEFORE the apply — an interrupted apply resumes idempotently, but the
 *   before-state can only be captured while the data is untouched.
 * - --apply --release-id=<id> --expected-products=<n>: per-product batches
 *   (one PATCH + one POST per reference, every write awaited). On an HTTP 401
 *   (admin token expiry, ~15 min) the run fails fast with a progress message
 *   (products done / remaining); re-running with a fresh token resumes.
 */

export const PRODUCTS_COLLECTION = "products";
export const IMAGES_COLLECTION = "product_images";
export const GALLERY_FIELD = "gallery";
export const MAIN_IMAGE_FIELD = "main_image";

export const PAGE_SIZE = 100;
export const MAX_PAGES = 200;
/** Bounded read of the existing rows of ONE product — never limit=-1. */
export const EXISTING_ROWS_LIMIT = 100;

export const sha256Hex = (value) =>
  createHash("sha256").update(String(value), "utf8").digest("hex");

const relationId = (value) =>
  typeof value === "string" ? value : (value?.id ?? null);

/**
 * Parses the legacy gallery JSON into an ordered list of non-empty string
 * file references. Accepts a parsed array (usual REST response) or a JSON
 * string; everything else degrades to an empty list.
 */
export function parseGalleryRefs(value) {
  if (value == null) return [];
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(source)) return [];
  return source
    .filter((item) => typeof item === "string" && item.trim() !== "")
    .map((item) => item.trim());
}

/**
 * Deterministic serialization of the legacy gallery value used for the
 * before-state hash. The reconcile step re-derives it from the live row and
 * proves the migration never modified the JSON.
 */
export function galleryCanonical(value) {
  if (value == null) return "null";
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value));
    } catch {
      return JSON.stringify(value);
    }
  }
  return JSON.stringify(value);
}

export const gallerySha256 = (value) => sha256Hex(galleryCanonical(value));

/**
 * The rollback artifact: one line per gallery product with the fields needed
 * to detect any later change of the untouched legacy JSON and of main_image.
 */
export function buildBeforeState(galleryProducts) {
  return [...galleryProducts]
    .sort((left, right) => String(left.id).localeCompare(String(right.id), "en"))
    .map((product) => ({
      product_id: product.id,
      gallery_sha256: gallerySha256(product.gallery),
      main_image: relationId(product.main_image),
    }));
}

/**
 * Pure per-product decision. The first reference is ALWAYS the main-image slot
 * (PATCHed only when main_image is null); the remaining references become rows
 * unless the (product, image) pair already exists or the reference repeats.
 */
export function planGalleryProduct(product, existingImages = []) {
  const refs = parseGalleryRefs(product.gallery);
  const mainImage = relationId(product.main_image);
  const mainImagePatch =
    mainImage == null && refs.length > 0 ? refs[0] : null;

  const existing = new Set(
    existingImages
      .map((row) => relationId(row?.image))
      .filter(Boolean),
  );
  // The main-slot reference is covered by main_image (existing or promoted),
  // so a later duplicate of it inside the same gallery never becomes a row.
  const planned = new Set(refs.length > 0 ? [refs[0]] : []);
  const rows = [];
  let skippedExisting = 0;
  let duplicateRefs = 0;

  refs.forEach((ref, index) => {
    if (index === 0) return; // the main-image slot, never a row
    if (existing.has(ref)) {
      skippedExisting += 1;
      return;
    }
    if (planned.has(ref)) {
      duplicateRefs += 1;
      return;
    }
    planned.add(ref);
    rows.push({ image: ref, sort_order: index });
  });

  return {
    productId: product.id,
    mainImage,
    mainImagePatch,
    rows,
    skippedExisting,
    duplicateRefs,
    refsTotal: refs.length,
  };
}

/**
 * Reads the current schema state needed by the preconditions. Read-only.
 */
export async function collectGalleryState(client) {
  const collections = await client.request("/collections");
  const collectionNames = new Set(
    collections.map(({ collection }) => collection),
  );
  return {
    collectionNames,
    hasProducts: collectionNames.has(PRODUCTS_COLLECTION),
    hasImages: collectionNames.has(IMAGES_COLLECTION),
  };
}

/**
 * Pure evaluation of the STOP preconditions.
 */
export function evaluateGalleryState(state, { expectedProducts = null, galleryProductCount = 0 } = {}) {
  const blockers = [];
  if (!state.hasProducts) {
    blockers.push({
      code: "missing-collection",
      detail: `required collection ${PRODUCTS_COLLECTION} not found`,
    });
  }
  if (!state.hasImages) {
    blockers.push({
      code: "missing-collection",
      detail: `required collection ${IMAGES_COLLECTION} not found`,
    });
  }
  if (expectedProducts != null && galleryProductCount !== expectedProducts) {
    blockers.push({
      code: "unexpected-product-count",
      detail: `found ${galleryProductCount} product(s) with a non-empty legacy gallery, expected ${expectedProducts} from the release baseline`,
    });
  }
  return { ok: blockers.length === 0, blockers };
}

const galleryPageQuery = (page, pageSize) =>
  new URLSearchParams({
    "filter[gallery][_null]": "false",
    fields: "id,main_image,gallery",
    sort: "id",
    limit: String(pageSize),
    page: String(page),
  });

const existingRowsQuery = (productId) =>
  new URLSearchParams({
    "filter[product][_eq]": String(productId),
    fields: "image",
    limit: String(EXISTING_ROWS_LIMIT),
  });

const interruptedError = (progress, error) =>
  new Error(
    `product gallery migration interrupted after ${progress.productsDone}/${progress.galleryProducts} gallery product(s) ` +
      `(${progress.rowsCreated} product_images row(s) written, ~${progress.rowsRemainingPlanned} row(s) and ` +
      `${progress.mainPatchesRemaining} main_image patch(es) remaining): ${error.message}. ` +
      "Re-run the same command with a fresh admin token to resume — already-written (product, image) pairs are skipped.",
    { cause: error },
  );

/**
 * Orchestrates the gallery migration. Default mode is a dry run (no writes).
 * `apply` requires a `releaseId` and an operator-passed `expectedProducts`
 * baseline; a stopped result performs no writes even in apply mode.
 */
export async function runProductGalleryMigration(
  client,
  {
    apply = false,
    releaseId = null,
    expectedProducts = null,
    pageSize = PAGE_SIZE,
  } = {},
) {
  if (apply && !releaseId) {
    throw new Error("--apply requires --release-id=<id>");
  }

  const state = await collectGalleryState(client);

  // Read every gallery product page by page (deterministic sort=id) BEFORE
  // any write so the expected-products guard sees the full picture.
  const scanned = [];
  let pages = 0;
  let pageLimitExceeded = false;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const rows = await client.request(
      `/items/${PRODUCTS_COLLECTION}?${galleryPageQuery(page, pageSize).toString()}`,
    );
    if (!Array.isArray(rows) || rows.length === 0) break;
    pages = page;
    scanned.push(...rows);
    if (rows.length < pageSize) break;
    if (page === MAX_PAGES) pageLimitExceeded = true;
  }

  const galleryProducts = scanned.filter(
    (product) => parseGalleryRefs(product?.gallery).length > 0,
  );

  if (apply && expectedProducts == null) {
    // The operator must carry the baseline count from the release plan.
    return {
      ok: false,
      stopped: true,
      applied: false,
      noop: false,
      releaseId,
      migration: "product-gallery",
      blockers: [{
        code: "missing-expected-products",
        detail: "--apply requires --expected-products=<n> from the release baseline (the count is never hardcoded)",
      }],
      report: [],
      summary: emptySummary(pageSize),
      beforeState: [],
      expectedAfter: EXPECTED_AFTER,
    };
  }

  const evaluation = evaluateGalleryState(state, {
    expectedProducts,
    galleryProductCount: galleryProducts.length,
  });
  if (!evaluation.ok || pageLimitExceeded) {
    const blockers = [...evaluation.blockers];
    if (pageLimitExceeded) {
      blockers.push({
        code: "page-limit-exceeded",
        detail: `stopped after MAX_PAGES=${MAX_PAGES} pages — rerun after investigating`,
      });
    }
    return {
      ok: false,
      stopped: true,
      applied: false,
      noop: false,
      releaseId,
      migration: "product-gallery",
      blockers,
      report: [],
      summary: {
        ...emptySummary(pageSize),
        pages,
        productsScanned: scanned.length,
        productsWithGallery: galleryProducts.length,
      },
      beforeState: [],
      expectedAfter: EXPECTED_AFTER,
    };
  }

  const report = scanned.length
    ? [{ action: "scan page", page: 1, pages, scanned: scanned.length, withGallery: galleryProducts.length }]
    : [];

  // Existing rows per product (bounded, one read per product) make the plan
  // idempotent and resumable.
  const plans = [];
  for (const product of galleryProducts) {
    const existingRows = await client.request(
      `/items/${IMAGES_COLLECTION}?${existingRowsQuery(product.id).toString()}`,
    );
    plans.push(planGalleryProduct(product, Array.isArray(existingRows) ? existingRows : []));
  }

  const summary = {
    pageSize,
    pages,
    productsScanned: scanned.length,
    productsWithGallery: galleryProducts.length,
    refsTotal: plans.reduce((total, plan) => total + plan.refsTotal, 0),
    mainImagePromotions: plans.filter((plan) => plan.mainImagePatch !== null).length,
    rowsPlanned: plans.reduce((total, plan) => total + plan.rows.length, 0),
    rowsSkippedExisting: plans.reduce((total, plan) => total + plan.skippedExisting, 0),
    duplicateRefsSkipped: plans.reduce((total, plan) => total + plan.duplicateRefs, 0),
    productsWritten: 0,
    rowsCreated: 0,
    mainImagePromotionsApplied: 0,
  };
  const beforeState = buildBeforeState(galleryProducts);

  const noop = summary.rowsPlanned === 0 && summary.mainImagePromotions === 0;

  if (apply && !noop) {
    // Small batches: one awaited PATCH (optional) + one awaited POST per row.
    // On any failure (typically HTTP 401 token expiry) the run fails fast with
    // the progress so a re-run resumes where it stopped.
    const progress = {
      galleryProducts: plans.length,
      productsDone: 0,
      rowsCreated: 0,
      rowsRemainingPlanned: summary.rowsPlanned,
      mainPatchesRemaining: summary.mainImagePromotions,
    };
    try {
      for (const plan of plans) {
        if (plan.mainImagePatch !== null) {
          await client.request(
            `/items/${PRODUCTS_COLLECTION}/${encodeURIComponent(plan.productId)}`,
            {
              method: "PATCH",
              body: JSON.stringify({ [MAIN_IMAGE_FIELD]: plan.mainImagePatch }),
            },
          );
          summary.mainImagePromotionsApplied += 1;
          progress.mainPatchesRemaining -= 1;
        }
        for (const row of plan.rows) {
          await client.request(`/items/${IMAGES_COLLECTION}`, {
            method: "POST",
            body: JSON.stringify({
              product: plan.productId,
              image: row.image,
              sort_order: row.sort_order,
            }),
          });
          summary.rowsCreated += 1;
          progress.rowsCreated += 1;
          progress.rowsRemainingPlanned -= 1;
        }
        summary.productsWritten += 1;
        progress.productsDone += 1;
      }
    } catch (error) {
      throw interruptedError(progress, error);
    }
    report.push({
      action: "apply batch",
      products: summary.productsWritten,
      rows: summary.rowsCreated,
      mainPatches: summary.mainImagePromotionsApplied,
    });
  }

  return {
    ok: true,
    stopped: false,
    applied: apply,
    noop,
    releaseId,
    migration: "product-gallery",
    blockers: [],
    report,
    summary,
    beforeState,
    expectedAfter: EXPECTED_AFTER,
  };
}

export const EXPECTED_AFTER = {
  rowsPlanned: 0,
  mainImagePromotions: 0,
};

function emptySummary(pageSize) {
  return {
    pageSize,
    pages: 0,
    productsScanned: 0,
    productsWithGallery: 0,
    refsTotal: 0,
    mainImagePromotions: 0,
    rowsPlanned: 0,
    rowsSkippedExisting: 0,
    duplicateRefsSkipped: 0,
    productsWritten: 0,
    rowsCreated: 0,
    mainImagePromotionsApplied: 0,
  };
}

const writeBeforeStateExclusive = async (directory, rows) => {
  for (const row of rows) assertSafeArtifact(row);
  const filename = path.join(directory, "product-gallery-before-state.ndjson");
  const handle = await open(filename, "wx");
  try {
    await handle.writeFile(
      rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""),
      "utf8",
    );
  } finally {
    await handle.close();
  }
  return filename;
};

const argumentValue = (name, args = process.argv.slice(2)) => {
  const prefix = `--${name}=`;
  return args.find((value) => value.startsWith(prefix))?.slice(prefix.length);
};

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const releaseId = argumentValue("release-id", args) ?? null;
  const expectedProductsRaw = argumentValue("expected-products", args);
  const expectedProducts = expectedProductsRaw == null
    ? null
    : Number(expectedProductsRaw);
  const outputDirectory = argumentValue("output", args) ?? null;

  const client = await DirectusAdminClient.connectFromEnvironment();
  const result = await runProductGalleryMigration(client, {
    apply,
    releaseId,
    expectedProducts,
  });

  if (outputDirectory) {
    const repositoryRoot = path.resolve(import.meta.dirname, "../..");
    const directory = await assertArtifactDirectory(outputDirectory, {
      repositoryRoot,
      scanExistingFiles: true,
    });
    const { beforeState, ...planArtifact } = result;
    await writeArtifactsExclusive(directory, {
      "product-gallery-plan.json": planArtifact,
    });
    const beforeStateFilename = await writeBeforeStateExclusive(directory, beforeState);
    console.log(`Wrote product gallery plan to ${path.join(directory, "product-gallery-plan.json")}`);
    console.log(`Wrote before-state to ${beforeStateFilename}`);
  }

  if (result.stopped) {
    console.error(
      `STOP: ${result.blockers.length} blocker(s) prevented the product gallery migration:`,
    );
    for (const blocker of result.blockers) {
      console.error(`- [${blocker.code}] ${blocker.detail}`);
    }
    process.exitCode = 1;
    return;
  }

  if (result.noop) {
    console.log(
      "Product galleries are already migrated — nothing to do " +
        `(${result.summary.productsWithGallery} gallery product(s) scanned).`,
    );
    return;
  }

  const verb = apply ? "Applied" : "Planned";
  const s = result.summary;
  console.log(
    `${verb} the product gallery migration: ${s.productsWithGallery} gallery product(s), ` +
      `${s.refsTotal} legacy reference(s), ${s.mainImagePromotions} main_image promotion(s), ` +
      `${s.rowsPlanned} product_images row(s)${s.duplicateRefsSkipped ? `, ${s.duplicateRefsSkipped} duplicate reference(s) skipped` : ""}.`,
  );
  if (apply) {
    console.log(
      `- written: ${s.productsWritten} product batch(es), ${s.rowsCreated} row(s), ${s.mainImagePromotionsApplied} main_image patch(es)`,
    );
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
