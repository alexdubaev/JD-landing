import test from "node:test";
import assert from "node:assert/strict";

import { gallerySha256 } from "./migrate-product-gallery.mjs";
import { reconcileProductGallery } from "./reconcile-product-gallery.mjs";

const liveProduct = (id, overrides = {}) => ({
  id,
  main_image: null,
  gallery: [],
  ...overrides,
});

/**
 * Mock Directus client serving single-product GETs as OBJECTS (the Directus
 * REST contract for single-item reads) and a paged product_images list.
 */
const mockClient = ({ productsById = {}, imageRows = [] } = {}) => {
  const requests = [];
  return {
    requests,
    async request(path) {
      requests.push({ path });
      const productMatch = path.match(/^\/items\/products\/([^?]+)/);
      if (productMatch) {
        return productsById[decodeURIComponent(productMatch[1])] ?? null;
      }
      if (path.startsWith("/items/product_images?")) {
        const params = new URL(path, "https://directus.test").searchParams;
        const page = Number(params.get("page") ?? "1");
        const limit = Number(params.get("limit") ?? "100");
        return imageRows.slice((page - 1) * limit, page * limit);
      }
      return [];
    },
  };
};

const beforeStateOf = (...products) =>
  products
    .sort((left, right) => String(left.id).localeCompare(String(right.id), "en"))
    .map((product) => ({
      product_id: product.id,
      gallery_sha256: gallerySha256(product.gallery),
      main_image: product.main_image,
    }));

test("a fully migrated instance reconciles OK with zero remaining references", async () => {
  // p2 keeps its pre-existing main_image that equals the first reference —
  // the migration leaves such main_image values untouched.
  const p1 = liveProduct("p1", { gallery: ["f1", "f2", "f3"] }); // main was null
  const p2 = liveProduct("p2", { main_image: "keep", gallery: ["keep"] }); // single ref = main slot
  const p3 = liveProduct("p3", { gallery: ["g1", "g2", "g3", "g4"] });

  const client = mockClient({
    productsById: {
      p1: liveProduct("p1", { main_image: "f1", gallery: ["f1", "f2", "f3"] }),
      p2: liveProduct("p2", { main_image: "keep", gallery: ["keep"] }),
      p3: liveProduct("p3", { main_image: "g1", gallery: ["g1", "g2", "g3", "g4"] }),
    },
    imageRows: [
      { product: "p1", image: "f2" },
      { product: "p1", image: "f3" },
      { product: "p3", image: "g2" },
      { product: "p3", image: "g3" },
      { product: "p3", image: "g4" },
    ],
  });

  const result = await reconcileProductGallery(client, {
    beforeState: beforeStateOf(p1, p2, p3),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
  assert.equal(result.summary.products, 3);
  assert.equal(result.summary.rowsTotal, 5);
  assert.equal(result.summary.productsWithImages, 2);
  assert.equal(result.summary.remainingLegacyRefs, 0);
});

test("detects a changed legacy gallery JSON via the before-state hash", async () => {
  const before = liveProduct("p1", { gallery: ["f1", "f2"] });
  const client = mockClient({
    productsById: {
      p1: liveProduct("p1", { main_image: "f1", gallery: ["f1", "f2", "EDITED"] }),
    },
    imageRows: [{ product: "p1", image: "f2" }],
  });

  const result = await reconcileProductGallery(client, {
    beforeState: beforeStateOf(before),
  });

  assert.equal(result.ok, false);
  assert.ok(result.violations.some(({ code }) => code === "gallery-changed"));
  assert.equal(result.summary.galleryChanged, 1);
});

test("detects duplicate (product, image) pairs", async () => {
  const before = liveProduct("p1", { gallery: ["f1", "f2", "f3"] });
  const client = mockClient({
    productsById: {
      p1: liveProduct("p1", { main_image: "f1", gallery: ["f1", "f2", "f3"] }),
    },
    imageRows: [
      { product: "p1", image: "f2" },
      { product: "p1", image: "f2" },
    ],
  });

  const result = await reconcileProductGallery(client, {
    beforeState: beforeStateOf(before),
  });

  assert.equal(result.ok, false);
  assert.ok(result.violations.some(({ code }) => code === "duplicate-pair"));
  assert.equal(result.summary.duplicatePairs, 1);
});

test("detects orphan rows that are not legacy gallery references", async () => {
  const before = liveProduct("p1", { gallery: ["f1", "f2"] });
  const client = mockClient({
    productsById: {
      p1: liveProduct("p1", { main_image: "f1", gallery: ["f1", "f2"] }),
    },
    imageRows: [
      { product: "p1", image: "f2" },
      { product: "p1", image: "rogue-image" },
    ],
  });

  const result = await reconcileProductGallery(client, {
    beforeState: beforeStateOf(before),
  });

  assert.equal(result.ok, false);
  assert.ok(result.violations.some(({ code }) => code === "orphan-row"));
  assert.equal(result.summary.orphanRows, 1);
});

test("detects rows created outside the migrated gallery scope", async () => {
  const before = liveProduct("p1", { gallery: ["f1", "f2"] });
  const client = mockClient({
    productsById: {
      p1: liveProduct("p1", { main_image: "f1", gallery: ["f1", "f2"] }),
    },
    imageRows: [
      { product: "p1", image: "f2" },
      { product: "p-other", image: "x1" },
    ],
  });

  const result = await reconcileProductGallery(client, {
    beforeState: beforeStateOf(before),
  });

  assert.equal(result.ok, false);
  assert.ok(result.violations.some(({ code }) => code === "unexpected-row"));
});

test("detects an unexpected main_image change", async () => {
  const before = liveProduct("p1", { main_image: "keep", gallery: ["f1", "f2"] });
  const client = mockClient({
    productsById: {
      // main_image was overwritten although the before-state had a value.
      p1: liveProduct("p1", { main_image: "f1", gallery: ["f1", "f2"] }),
    },
    imageRows: [{ product: "p1", image: "f2" }],
  });

  const result = await reconcileProductGallery(client, {
    beforeState: beforeStateOf(before),
  });

  assert.equal(result.ok, false);
  assert.ok(result.violations.some(({ code }) => code === "main-image-mismatch"));
  assert.equal(result.summary.mainImageMismatches, 1);
});

test("counts remaining legacy references for a partially migrated product", async () => {
  const before = liveProduct("p1", { gallery: ["f1", "f2", "f3", "f4"] });
  const client = mockClient({
    productsById: {
      p1: liveProduct("p1", { main_image: "f1", gallery: ["f1", "f2", "f3", "f4"] }),
    },
    imageRows: [{ product: "p1", image: "f2" }],
  });

  const result = await reconcileProductGallery(client, {
    beforeState: beforeStateOf(before),
  });

  // f3 and f4 are covered by neither main_image nor a row yet.
  assert.equal(result.ok, true);
  assert.equal(result.summary.remainingLegacyRefs, 2);
  assert.deepEqual(result.products, [
    { product_id: "p1", rows: 1, remaining: 2 },
  ]);
});

test("reports a pre-existing main_image that differs from the first reference as remaining", async () => {
  // The migration may NOT touch an existing main_image, so a first reference
  // that differs from it never becomes a row — reconcile keeps counting it so
  // the operator can review the discrepancy.
  const before = liveProduct("p1", { main_image: "keep", gallery: ["f1", "f2"] });
  const client = mockClient({
    productsById: {
      p1: liveProduct("p1", { main_image: "keep", gallery: ["f1", "f2"] }),
    },
    imageRows: [{ product: "p1", image: "f2" }],
  });

  const result = await reconcileProductGallery(client, {
    beforeState: beforeStateOf(before),
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.remainingLegacyRefs, 1);
});

test("flags a missing product row", async () => {
  const client = mockClient({ productsById: {}, imageRows: [] });

  const result = await reconcileProductGallery(client, {
    beforeState: beforeStateOf(liveProduct("p1", { gallery: ["f1"] })),
  });

  assert.equal(result.ok, false);
  assert.ok(result.violations.some(({ code }) => code === "missing-product"));
});

test("scans product_images in bounded pages (never limit=-1)", async () => {
  const imageRows = Array.from({ length: 101 }, (_, index) => ({
    product: "p1",
    image: `f${index + 2}`,
  }));
  const gallery = ["f1", ...imageRows.map(({ image }) => image)];
  const client = mockClient({
    productsById: { p1: liveProduct("p1", { main_image: "f1", gallery }) },
    imageRows,
  });

  const result = await reconcileProductGallery(client, {
    beforeState: beforeStateOf(liveProduct("p1", { gallery })),
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.rowsTotal, 101);
  assert.equal(result.summary.remainingLegacyRefs, 0);

  const scanUrls = client.requests
    .filter(({ path }) => path.startsWith("/items/product_images?"))
    .map(({ path }) => new URL(path, "https://directus.test").searchParams);
  assert.equal(scanUrls.length, 2, "101 rows at 100/page");
  for (const params of scanUrls) {
    assert.equal(params.get("limit"), "100");
    assert.notEqual(params.get("limit"), "-1");
  }
  assert.equal(scanUrls[1].get("page"), "2");
});
