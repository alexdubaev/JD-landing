// Task 11 (R7B) reconciliation: proves the product gallery migration state
// after apply. Per before-state product:
// - the legacy products.gallery JSON is byte-unchanged (gallery_sha256 vs the
//   before-state captured by the dry run);
// - products.main_image is exactly the before-state value, or the first
//   gallery reference when it was null (the one promotion this migration may
//   perform);
// - the product_images rows of the product contain no duplicate
//   (product, image) pairs and no orphan rows (every row image is a member of
//   that product's legacy gallery);
// - every product_images row in the instance belongs to a before-state
//   product (nothing was created outside the declared scope).
//
// Summary counts: rows created, products with images, remaining legacy
// references (refs covered by neither main_image nor a row — expected to be 0
// after a full apply). Pure checks + thin CLI; no writes.

import { readFile } from "node:fs/promises";

import { DirectusAdminClient, isMainModule } from "../schema/apply-schema.mjs";
import {
  IMAGES_COLLECTION,
  PRODUCTS_COLLECTION,
  gallerySha256,
  parseGalleryRefs,
} from "./migrate-product-gallery.mjs";

const ROWS_SCAN_LIMIT = 100;
const MAX_SCAN_PAGES = 500;

const relationId = (value) =>
  typeof value === "string" ? value : (value?.id ?? null);

const rowsScanQuery = (page) =>
  new URLSearchParams({
    fields: "product,image",
    sort: "id",
    limit: String(ROWS_SCAN_LIMIT),
    page: String(page),
  });

export async function reconcileProductGallery(client, { beforeState }) {
  const violations = [];
  const products = [];

  // Bounded paged scan of every product_images row (never limit=-1).
  const rowsByProduct = new Map();
  let scanPages = 0;
  for (let page = 1; page <= MAX_SCAN_PAGES; page += 1) {
    const rows = await client.request(
      `/items/${IMAGES_COLLECTION}?${rowsScanQuery(page).toString()}`,
    );
    if (!Array.isArray(rows) || rows.length === 0) break;
    scanPages = page;
    for (const row of rows) {
      const productId = relationId(row?.product);
      if (!productId) continue;
      if (!rowsByProduct.has(productId)) rowsByProduct.set(productId, []);
      rowsByProduct.get(productId).push(row);
    }
    if (rows.length < ROWS_SCAN_LIMIT) break;
  }

  const scopeProductIds = new Set(
    beforeState.map(({ product_id }) => String(product_id)),
  );
  for (const [productId, rows] of rowsByProduct) {
    if (!scopeProductIds.has(productId)) {
      violations.push({
        code: "unexpected-row",
        product_id: productId,
        detail: `product_images exist for ${productId} which is not part of the migrated gallery scope`,
        count: rows.length,
      });
    }
  }

  const summary = {
    products: beforeState.length,
    scanPages,
    rowsTotal: 0,
    productsWithImages: 0,
    remainingLegacyRefs: 0,
    duplicatePairs: 0,
    orphanRows: 0,
    galleryChanged: 0,
    mainImageMismatches: 0,
  };

  for (const row of beforeState) {
    // The Directus REST API returns the item OBJECT for a single-item GET
    // (unlike list queries, which return arrays).
    const fetched = await client.request(
      `/items/${PRODUCTS_COLLECTION}/${encodeURIComponent(row.product_id)}?fields=id,main_image,gallery`,
    );
    const product = Array.isArray(fetched) ? fetched[0] : fetched;
    if (!product) {
      violations.push({ code: "missing-product", product_id: row.product_id });
      products.push({ product_id: row.product_id, rows: 0, remaining: null });
      continue;
    }

    if (gallerySha256(product.gallery) !== row.gallery_sha256) {
      violations.push({ code: "gallery-changed", product_id: row.product_id });
      summary.galleryChanged += 1;
    }

    const refs = parseGalleryRefs(product.gallery);
    const refsSet = new Set(refs);
    const liveMain = relationId(product.main_image);
    const expectedMain = row.main_image ?? refs[0] ?? null;
    if (liveMain !== expectedMain) {
      violations.push({
        code: "main-image-mismatch",
        product_id: row.product_id,
        detail: `main_image is ${liveMain}, expected ${expectedMain}`,
      });
      summary.mainImageMismatches += 1;
    }

    const rows = rowsByProduct.get(String(row.product_id)) ?? [];
    const seenImages = new Set();
    const covered = new Set(liveMain ? [liveMain] : []);
    for (const imageRow of rows) {
      const image = relationId(imageRow?.image);
      if (seenImages.has(image)) {
        violations.push({
          code: "duplicate-pair",
          product_id: row.product_id,
          detail: `duplicate product_images pair (${row.product_id}, ${image})`,
        });
        summary.duplicatePairs += 1;
      }
      seenImages.add(image);
      covered.add(image);
      if (!refsSet.has(image)) {
        violations.push({
          code: "orphan-row",
          product_id: row.product_id,
          detail: `product_images row ${image} is not a legacy gallery reference of ${row.product_id}`,
        });
        summary.orphanRows += 1;
      }
    }

    const remaining = refs.filter((ref) => !covered.has(ref));
    summary.rowsTotal += rows.length;
    if (rows.length > 0) summary.productsWithImages += 1;
    summary.remainingLegacyRefs += remaining.length;

    products.push({
      product_id: row.product_id,
      rows: rows.length,
      remaining: remaining.length,
    });
  }

  return { ok: violations.length === 0, violations, summary, products };
}

const argumentValue = (name, args = process.argv.slice(2)) => {
  const prefix = `--${name}=`;
  return args.find((value) => value.startsWith(prefix))?.slice(prefix.length);
};

async function main() {
  const beforeStateFile = argumentValue("before-state");
  if (!beforeStateFile) {
    throw new Error("Set --before-state=<ndjson> (captured by the dry run)");
  }
  const beforeState = (await readFile(beforeStateFile, "utf8"))
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
  const client = await DirectusAdminClient.connectFromEnvironment();
  const result = await reconcileProductGallery(client, { beforeState });

  const s = result.summary;
  console.log(
    `Reconciled ${s.products} gallery product(s): ${s.rowsTotal} product_images row(s), ` +
      `${s.productsWithImages} product(s) with images, ${s.remainingLegacyRefs} remaining legacy reference(s).`,
  );
  for (const product of result.products.slice(0, 10)) {
    console.log(`- ${product.product_id}: rows ${product.rows}, remaining ${product.remaining}`);
  }
  if (result.products.length > 10) {
    console.log(`- ... ${result.products.length - 10} more`);
  }
  if (!result.ok) {
    console.error(`Reconciliation FAILED with ${result.violations.length} violation(s):`);
    for (const violation of result.violations) {
      console.error(`- [${violation.code}] ${violation.product_id}: ${violation.detail ?? ""}`);
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
