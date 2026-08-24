import test from "node:test";
import assert from "node:assert/strict";

import {
  EXPECTED_AFTER,
  MAX_PAGES,
  NORMALIZED_FIELD_PAIRS,
  PAGE_SIZE,
  buildNormalizedPatch,
  collectBackfillState,
  evaluateBackfillState,
  normalizeCode,
  runProductSearchBackfill,
} from "./backfill-product-search.mjs";
import { assertSafeArtifact } from "../releases/lib/artifacts.mjs";

const PRODUCTS_FIELDS = [
  { field: "id" },
  { field: "status" },
  { field: "title" },
  { field: "slug" },
  { field: "sku" },
  { field: "mpn" },
  { field: "sku_normalized" },
  { field: "mpn_normalized" },
];

const product = (id, overrides = {}) => ({
  id,
  sku: `SKU-${id}`,
  mpn: null,
  sku_normalized: null,
  mpn_normalized: null,
  ...overrides,
});

/**
 * Mock Directus client serving the collection list, the products fields and a
 * paginated products list. No live Directus is required.
 */
const mockClient = ({
  collections = [{ collection: "products" }, { collection: "directus_users" }],
  productsFields = PRODUCTS_FIELDS,
  products = [],
} = {}) => {
  const requests = [];
  const patches = [];
  return {
    requests,
    patches,
    async request(path, options = {}) {
      const method = options.method ?? "GET";
      requests.push({ path, method, body: options.body });
      if (method === "PATCH") {
        patches.push({ path, body: JSON.parse(options.body) });
        return product("patched");
      }
      if (path === "/collections") return collections;
      if (path === "/fields/products") return productsFields;
      if (path.startsWith("/items/products?")) {
        const params = new URL(path, "https://directus.test").searchParams;
        const page = Number(params.get("page") ?? "1");
        const limit = Number(params.get("limit") ?? String(PAGE_SIZE));
        return products.slice((page - 1) * limit, page * limit);
      }
      return [];
    },
  };
};

test("normalizeCode uppercases, trims and collapses non-alphanumerics", () => {
  assert.equal(normalizeCode(" re-504 836 "), "RE504836");
  assert.equal(normalizeCode("re504836"), "RE504836");
  assert.equal(normalizeCode("AH128449/A"), "AH128449A");
  assert.equal(normalizeCode("  пц.10-20  "), "1020");
  assert.equal(normalizeCode("---"), "");
  assert.equal(normalizeCode(null), "");
  assert.equal(normalizeCode(undefined), "");
});

test("buildNormalizedPatch derives only the two normalized fields", () => {
  const patch = buildNormalizedPatch({
    id: "p1",
    sku: " re-504 836 ",
    mpn: "ah.128449",
    sku_normalized: null,
    mpn_normalized: null,
  });
  assert.deepEqual(patch, { sku_normalized: "RE504836", mpn_normalized: "AH128449" });

  // Source with punctuation only normalizes to nothing: no write.
  assert.equal(
    buildNormalizedPatch({ sku: "---", mpn: null, sku_normalized: null, mpn_normalized: null }),
    null,
  );
  // Empty sources are never written and never cleared (mpn_normalized stays stale).
  assert.equal(
    buildNormalizedPatch({ sku: "  ", mpn: null, sku_normalized: "OLD", mpn_normalized: null }),
    null,
  );
  // Already-current sources produce no patch at all.
  assert.equal(
    buildNormalizedPatch({
      sku: "RE504836",
      mpn: null,
      sku_normalized: "RE504836",
      mpn_normalized: "STALE",
    }),
    null,
  );
});

test("a stale mpn alone still produces a one-field patch", () => {
  assert.deepEqual(
    buildNormalizedPatch({
      id: "p2",
      sku: "RE504836",
      mpn: "AH128449",
      sku_normalized: "RE504836",
      mpn_normalized: null,
    }),
    { mpn_normalized: "AH128449" },
  );
});

test("dry run is the default and performs no writes", async () => {
  const client = mockClient({
    products: [
      product("p1", { sku: "re504836", sku_normalized: null }),
      product("p2", { sku: "AH128449", sku_normalized: "AH128449", mpn: "MPN-1", mpn_normalized: "MPN1" }),
      product("p3", { sku: "  ", sku_normalized: null }),
    ],
  });
  const result = await runProductSearchBackfill(client);

  assert.equal(result.ok, true);
  assert.equal(result.applied, false);
  assert.equal(result.noop, false);
  assert.equal(client.patches.length, 0, "no writes in dry-run mode");
  assert.deepEqual(
    client.requests.map(({ method }) => method).filter((m) => m !== "GET"),
    [],
  );

  assert.equal(result.summary.productsTotal, 3);
  assert.equal(result.summary.skuFilled, 2);
  assert.equal(result.summary.mpnFilled, 1);
  assert.equal(result.summary.emptySource, 1);
  assert.equal(result.summary.alreadyCurrent, 1, "p2 needs no patch");
  assert.equal(result.summary.patchTotal, 1, "only p1 sku needs a patch");
  assert.equal(result.summary.pendingSkuWrites, 1);
  assert.equal(result.summary.pendingMpnWrites, 0);
  assert.deepEqual(result.report, [
    { action: "scan page", page: 1, scanned: 3, patches: 1, skuWrites: 1, mpnWrites: 0 },
  ]);
});

test("pages through the catalog 500 items at a time", async () => {
  const products = Array.from({ length: PAGE_SIZE + 1 }, (_, index) =>
    product(`p${String(index + 1).padStart(4, "0")}`, {
      sku: `SKU ${index + 1}`,
      sku_normalized: null,
    }),
  );
  const client = mockClient({ products });
  const result = await runProductSearchBackfill(client);

  assert.equal(result.ok, true);
  assert.equal(result.summary.pages, 2);
  assert.equal(result.summary.productsTotal, PAGE_SIZE + 1);
  assert.deepEqual(result.report.map(({ page }) => page), [1, 2]);
  assert.deepEqual(result.report.map(({ scanned }) => scanned), [PAGE_SIZE, 1]);
  assert.equal(result.summary.patchTotal, PAGE_SIZE + 1);
  assert.equal(client.patches.length, 0, "dry run never patches");

  const pageQuery = new URL(client.requests[2].path, "https://directus.test").searchParams;
  assert.equal(pageQuery.get("limit"), "500");
  assert.equal(pageQuery.get("sort"), "id");
  assert.equal(pageQuery.get("fields"), "id,sku,mpn,sku_normalized,mpn_normalized");
  assert.ok(pageQuery.get("page") === "1" || pageQuery.get("page") === "2");
});

test("apply requires a release id", async () => {
  const client = mockClient({ products: [product("p1", { sku: "re504836" })] });
  await assert.rejects(
    () => runProductSearchBackfill(client, { apply: true }),
    /release-id/i,
  );
  assert.equal(client.patches.length, 0);
});

test("apply writes ONLY sku_normalized and mpn_normalized per item", async () => {
  const client = mockClient({
    products: [
      product("p1", { sku: " re-504 836 ", sku_normalized: null, mpn: "AH.128449" }),
      product("p2", { sku: "AH128449", sku_normalized: "AH128449" }),
      product("p3", { sku: "", sku_normalized: null, mpn: null }),
    ],
  });
  const result = await runProductSearchBackfill(client, {
    apply: true,
    releaseId: "R6-2026-08-15",
  });

  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.equal(result.releaseId, "R6-2026-08-15");

  // Only p1 needs writes: one PATCH carrying both derived fields.
  assert.equal(client.patches.length, 1);
  assert.match(client.patches[0].path, /^\/items\/products\/p1$/);
  assert.deepEqual(client.patches[0].body, {
    sku_normalized: "RE504836",
    mpn_normalized: "AH128449",
  });

  // The write set is restricted to the two derived fields by construction.
  for (const { body } of client.patches) {
    for (const key of Object.keys(body)) {
      assert.ok(
        Object.values(NORMALIZED_FIELD_PAIRS).includes(key),
        `unexpected write to products.${key}`,
      );
    }
  }
  // No schema endpoints are touched by the backfill (reads are fine).
  for (const { method, path } of client.requests) {
    if (method === "GET") continue;
    assert.doesNotMatch(path, /\/fields\//, "the backfill never writes schema");
    assert.doesNotMatch(path, /\/collections/, "the backfill never writes collections");
  }
  assert.deepEqual(EXPECTED_AFTER, {
    patchTotal: 0,
    pendingSkuWrites: 0,
    pendingMpnWrites: 0,
  });
});

test("a fully backfilled instance reports as a resumable no-op", async () => {
  const client = mockClient({
    products: [
      product("p1", { sku: "RE504836", sku_normalized: "RE504836" }),
      product("p2", { sku: "AH128449", sku_normalized: "AH128449", mpn: "MPN1", mpn_normalized: "MPN1" }),
    ],
  });
  const result = await runProductSearchBackfill(client, {
    apply: true,
    releaseId: "R6-resume",
  });

  assert.equal(result.ok, true);
  assert.equal(result.noop, true);
  assert.equal(result.applied, true);
  assert.equal(client.patches.length, 0, "already-current rows are skipped");
  assert.equal(result.summary.patchTotal, 0);
});

test("STOPS when the products collection is missing", async () => {
  const client = mockClient({ collections: [{ collection: "pages" }] });
  const result = await runProductSearchBackfill(client, { apply: true, releaseId: "R6" });

  assert.equal(result.stopped, true);
  assert.ok(
    result.blockers.some(
      (blocker) => blocker.code === "missing-collection" && blocker.detail.includes("products"),
    ),
  );
  assert.equal(client.patches.length, 0);
});

test("STOPS when the normalized fields were not applied yet", async () => {
  const client = mockClient({
    productsFields: PRODUCTS_FIELDS.filter(({ field }) => field !== "mpn_normalized"),
    products: [product("p1")],
  });
  const result = await runProductSearchBackfill(client, { apply: true, releaseId: "R6" });

  assert.equal(result.stopped, true);
  assert.ok(
    result.blockers.some(
      (blocker) => blocker.code === "missing-normalized-field" && blocker.detail.includes("mpn_normalized"),
    ),
  );
  assert.equal(client.patches.length, 0);
});

test("folders and system collections do not confuse the preconditions", async () => {
  const state = await collectBackfillState(mockClient({
    collections: [
      { collection: "group_catalog", meta: { folder: true } },
      { collection: "products", meta: { folder: false } },
      { collection: "directus_users", meta: {} },
    ],
  }));
  assert.equal(state.hasProducts, true);
  assert.deepEqual(state.missingNormalizedFields, []);
  assert.equal(evaluateBackfillState(state).ok, true);
});

test("the plan result is safe to store as a release artifact", async () => {
  const client = mockClient({
    products: [product("p1", { sku: "re504836", title: "Насос" })],
  });
  const result = await runProductSearchBackfill(client, { apply: true, releaseId: "R6" });

  // Counts and per-page batch numbers only — no ids, no sku/mpn values.
  assert.doesNotThrow(() => assertSafeArtifact(result));
  assert.ok(
    MAX_PAGES >= 26,
    "12 971 products at 500/page fit within the page guard",
  );
});
