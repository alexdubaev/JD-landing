import test from "node:test";
import assert from "node:assert/strict";

import {
  EXISTING_ROWS_LIMIT,
  EXPECTED_AFTER,
  MAX_PAGES,
  PAGE_SIZE,
  buildBeforeState,
  collectGalleryState,
  evaluateGalleryState,
  gallerySha256,
  parseGalleryRefs,
  planGalleryProduct,
  runProductGalleryMigration,
} from "./migrate-product-gallery.mjs";
import { assertSafeArtifact } from "../releases/lib/artifacts.mjs";

const product = (id, overrides = {}) => ({
  id,
  main_image: null,
  gallery: [],
  ...overrides,
});

/**
 * Mock Directus client serving the collection list, a "gallery is not null"
 * filtered products list (the real API applies the filter) and the existing
 * product_images rows per product. No live Directus is required.
 */
const mockClient = ({
  collections = [
    { collection: "products" },
    { collection: "product_images" },
    { collection: "directus_users" },
  ],
  products = [],
  existingImagesByProduct = {},
  failOnNthPost = null,
} = {}) => {
  const requests = [];
  const patches = [];
  const posts = [];
  let postCount = 0;
  return {
    requests,
    patches,
    posts,
    async request(path, options = {}) {
      const method = options.method ?? "GET";
      requests.push({ path, method, body: options.body });
      if (method === "PATCH") {
        patches.push({ path, body: JSON.parse(options.body) });
        return {};
      }
      if (method === "POST") {
        postCount += 1;
        if (failOnNthPost === postCount) {
          throw new Error(`POST ${path} failed: HTTP 401 token expired`);
        }
        posts.push({ path, body: JSON.parse(options.body) });
        return { data: { id: `row-${postCount}` } };
      }
      if (path === "/collections") return collections;
      if (path.startsWith("/items/products?")) {
        const params = new URL(path, "https://directus.test").searchParams;
        const page = Number(params.get("page") ?? "1");
        const limit = Number(params.get("limit") ?? String(PAGE_SIZE));
        return products.slice((page - 1) * limit, page * limit);
      }
      if (path.startsWith("/items/product_images?")) {
        const params = new URL(path, "https://directus.test").searchParams;
        const productId = params.get("filter[product][_eq]");
        return existingImagesByProduct[productId] ?? [];
      }
      return [];
    },
  };
};

test("parseGalleryRefs accepts parsed arrays, JSON strings and degrades junk", () => {
  assert.deepEqual(parseGalleryRefs([" a ", "", "b"]), ["a", "b"]);
  assert.deepEqual(parseGalleryRefs('["f1","f2"]'), ["f1", "f2"]);
  assert.deepEqual(parseGalleryRefs(null), []);
  assert.deepEqual(parseGalleryRefs("not-json"), []);
  assert.deepEqual(parseGalleryRefs({ nope: true }), []);
  assert.deepEqual(parseGalleryRefs([42, null, { id: "x" }]), []);
});

test("gallerySha256 is deterministic across raw-string and parsed forms", () => {
  assert.equal(
    gallerySha256(["f1", "f2"]),
    gallerySha256('["f1","f2"]'),
  );
  assert.equal(gallerySha256(null), gallerySha256(undefined));
});

test("planGalleryProduct promotes a null main_image and orders rows by JSON position", () => {
  const plan = planGalleryProduct(
    product("p1", { gallery: ["f1", "f2", "f3"] }),
    [],
  );

  assert.equal(plan.mainImagePatch, "f1");
  assert.deepEqual(plan.rows, [
    { image: "f2", sort_order: 1 },
    { image: "f3", sort_order: 2 },
  ]);
  assert.equal(plan.skippedExisting, 0);
  assert.equal(plan.duplicateRefs, 0);
});

test("planGalleryProduct never overwrites an existing main_image", () => {
  const plan = planGalleryProduct(
    product("p1", { main_image: "keep-me", gallery: ["f1", "f2"] }),
    [],
  );

  assert.equal(plan.mainImagePatch, null, "existing main_image values are read-only");
  assert.deepEqual(plan.rows, [{ image: "f2", sort_order: 1 }]);
});

test("planGalleryProduct skips existing pairs and duplicate references", () => {
  const plan = planGalleryProduct(
    product("p1", { gallery: ["f1", "f2", "f3", "f3", "f4"] }),
    [{ image: "f2" }, { image: "f4" }],
  );

  assert.equal(plan.mainImagePatch, "f1");
  assert.deepEqual(plan.rows, [{ image: "f3", sort_order: 2 }]);
  assert.equal(plan.skippedExisting, 2);
  assert.equal(plan.duplicateRefs, 1);
});

test("dry run is the default and performs no writes", async () => {
  const client = mockClient({
    products: [
      product("p1", { gallery: ["f1", "f2", "f3"] }),
      product("p2", { main_image: "keep", gallery: ["h1", "h1"] }),
    ],
  });
  const result = await runProductGalleryMigration(client);

  assert.equal(result.ok, true);
  assert.equal(result.applied, false);
  assert.equal(result.noop, false);
  assert.deepEqual(
    client.requests.map(({ method }) => method).filter((method) => method !== "GET"),
    [],
    "no writes in dry-run mode",
  );

  assert.equal(result.summary.productsScanned, 2);
  assert.equal(result.summary.productsWithGallery, 2);
  assert.equal(result.summary.refsTotal, 5);
  assert.equal(result.summary.mainImagePromotions, 1);
  assert.equal(result.summary.rowsPlanned, 2);
  assert.equal(result.summary.duplicateRefsSkipped, 1);

  const beforeState = result.beforeState;
  assert.deepEqual(
    beforeState.map(({ product_id }) => product_id),
    ["p1", "p2"],
  );
  assert.equal(beforeState[0].main_image, null);
  assert.equal(beforeState[1].main_image, "keep");
  assert.equal(beforeState[0].gallery_sha256, gallerySha256(["f1", "f2", "f3"]));
});

test("apply writes ONLY main_image patches and product_images rows", async () => {
  const client = mockClient({
    products: [
      product("p1", { gallery: ["f1", "f2", "f3"] }),
      product("p2", { main_image: "keep", gallery: ["h1", "h1"] }),
    ],
  });
  const result = await runProductGalleryMigration(client, {
    apply: true,
    releaseId: "R7B-2026-08-15",
    expectedProducts: 2,
  });

  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.equal(result.releaseId, "R7B-2026-08-15");
  assert.equal(result.summary.rowsCreated, 2);
  assert.equal(result.summary.mainImagePromotionsApplied, 1);

  // The ONLY products write is the single-field main_image promotion.
  assert.equal(client.patches.length, 1);
  assert.match(client.patches[0].path, /^\/items\/products\/p1$/);
  assert.deepEqual(client.patches[0].body, { main_image: "f1" });

  // The ONLY item writes are product_images rows with product/image/sort_order.
  assert.deepEqual(client.posts, [
    { path: "/items/product_images", body: { product: "p1", image: "f2", sort_order: 1 } },
    { path: "/items/product_images", body: { product: "p1", image: "f3", sort_order: 2 } },
  ]);

  // Write-set audit: legacy JSON, status and Files are never touched.
  for (const { body } of [...client.patches, ...client.posts]) {
    for (const key of Object.keys(body)) {
      assert.ok(
        ["main_image", "product", "image", "sort_order"].includes(key),
        `unexpected write key ${key}`,
      );
    }
  }
  for (const { method, path } of client.requests) {
    if (method === "GET") continue;
    assert.doesNotMatch(path, /\/files/, "the migration never writes Files");
    assert.notEqual(method, "DELETE", "the migration never deletes");
    assert.doesNotMatch(path, /\/fields\//, "the migration never writes schema");
    assert.doesNotMatch(path, /\/collections(\/|$)/, "the migration never writes collections");
  }
});

test("a fully migrated instance reports as an idempotent no-op", async () => {
  const client = mockClient({
    products: [
      // After the first apply: main_image promoted, all pairs created.
      product("p1", { main_image: "f1", gallery: ["f1", "f2", "f3"] }),
    ],
    existingImagesByProduct: {
      p1: [{ image: "f2" }, { image: "f3" }],
    },
  });
  const result = await runProductGalleryMigration(client, {
    apply: true,
    releaseId: "R7B-resume",
    expectedProducts: 1,
  });

  assert.equal(result.ok, true);
  assert.equal(result.noop, true, "re-run is a no-op");
  assert.equal(client.patches.length, 0);
  assert.equal(client.posts.length, 0);
  assert.equal(result.summary.rowsPlanned, 0);
  assert.equal(result.summary.mainImagePromotions, 0);
  assert.deepEqual(EXPECTED_AFTER, { rowsPlanned: 0, mainImagePromotions: 0 });
});

test("STOPS when the live gallery product count differs from the operator baseline", async () => {
  const client = mockClient({
    products: [product("p1", { gallery: ["f1", "f2"] })],
  });
  const result = await runProductGalleryMigration(client, {
    apply: true,
    releaseId: "R7B",
    expectedProducts: 283,
  });

  assert.equal(result.stopped, true);
  assert.ok(
    result.blockers.some(
      (blocker) =>
        blocker.code === "unexpected-product-count" &&
        blocker.detail.includes("283"),
    ),
  );
  assert.equal(client.patches.length + client.posts.length, 0);
});

test("apply without --expected-products STOPs instead of guessing", async () => {
  const client = mockClient({ products: [product("p1", { gallery: ["f1"] })] });
  const result = await runProductGalleryMigration(client, {
    apply: true,
    releaseId: "R7B",
  });

  assert.equal(result.stopped, true);
  assert.ok(
    result.blockers.some((blocker) => blocker.code === "missing-expected-products"),
  );
  assert.equal(client.posts.length, 0);
});

test("STOPS when the product_images collection is missing", async () => {
  const client = mockClient({
    collections: [{ collection: "products" }],
    products: [product("p1", { gallery: ["f1", "f2"] })],
  });
  const result = await runProductGalleryMigration(client, {
    apply: true,
    releaseId: "R7B",
    expectedProducts: 1,
  });

  assert.equal(result.stopped, true);
  assert.ok(
    result.blockers.some(
      (blocker) =>
        blocker.code === "missing-collection" && blocker.detail.includes("product_images"),
    ),
  );
  assert.equal(client.posts.length, 0);
});

test("apply requires a release id", async () => {
  const client = mockClient({ products: [product("p1", { gallery: ["f1"] })] });
  await assert.rejects(
    () => runProductGalleryMigration(client, { apply: true, expectedProducts: 1 }),
    /release-id/i,
  );
});

test("an HTTP 401 mid-apply fails fast with a resumable progress message", async () => {
  const client = mockClient({
    products: [
      product("p1", { gallery: ["f1", "f2", "f3"] }),
      product("p2", { gallery: ["g1", "g2"] }),
    ],
    failOnNthPost: 2,
  });

  await assert.rejects(
    () =>
      runProductGalleryMigration(client, {
        apply: true,
        releaseId: "R7B-401",
        expectedProducts: 2,
      }),
    (error) => {
      assert.match(error.message, /HTTP 401/);
      assert.match(error.message, /0\/2 gallery product/);
      assert.match(error.message, /1 product_images row/);
      assert.match(error.message, /2 row\(s\)/);
      assert.match(error.message, /1 main_image patch/);
      assert.match(error.message, /Re-run the same command/);
      return true;
    },
  );

  // p1's main patch + first row landed; the run stopped before p1's second row.
  assert.equal(client.patches.length, 1);
  assert.equal(client.posts.length, 1);
});

test("pages through the gallery products in bounded batches", async () => {
  const products = Array.from({ length: PAGE_SIZE + 1 }, (_, index) =>
    product(`p${String(index + 1).padStart(4, "0")}`, { gallery: ["f1"] }),
  );
  const client = mockClient({ products });
  const result = await runProductGalleryMigration(client);

  assert.equal(result.ok, true);
  assert.equal(result.summary.pages, 2);
  assert.equal(result.summary.productsWithGallery, PAGE_SIZE + 1);
  assert.equal(result.summary.refsTotal, PAGE_SIZE + 1);

  const pageQuery = new URL(client.requests[1].path, "https://directus.test").searchParams;
  assert.equal(pageQuery.get("limit"), String(PAGE_SIZE));
  assert.equal(pageQuery.get("sort"), "id");
  assert.equal(pageQuery.get("filter[gallery][_null]"), "false");

  const existingQuery = new URL(client.requests[3].path, "https://directus.test").searchParams;
  assert.equal(existingQuery.get("limit"), String(EXISTING_ROWS_LIMIT));
  assert.notEqual(existingQuery.get("limit"), "-1");
  assert.ok(MAX_PAGES >= 130, "the full 12 971-product catalog fits within the page guard");
});

test("the before-state rows and the plan artifact are safe to store", async () => {
  const client = mockClient({
    products: [product("p1", { gallery: ["f1", "f2"] })],
  });
  const result = await runProductGalleryMigration(client, {
    apply: true,
    releaseId: "R7B",
    expectedProducts: 1,
  });

  for (const row of result.beforeState) assert.doesNotThrow(() => assertSafeArtifact(row));
  const { beforeState, ...planArtifact } = result;
  assert.equal(beforeState.length, 1);
  assert.doesNotThrow(() => assertSafeArtifact(planArtifact));
});

test("folders and system collections do not confuse the preconditions", async () => {
  const state = await collectGalleryState(mockClient({
    collections: [
      { collection: "group_catalog", meta: { folder: true } },
      { collection: "products", meta: { folder: false } },
      { collection: "product_images", meta: { folder: false } },
      { collection: "directus_users", meta: {} },
    ],
  }));
  assert.deepEqual(
    evaluateGalleryState(state, { expectedProducts: 0, galleryProductCount: 0 }),
    { ok: true, blockers: [] },
  );
  assert.deepEqual(buildBeforeState([]), []);
});
