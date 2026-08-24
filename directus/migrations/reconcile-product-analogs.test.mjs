import test from "node:test";
import assert from "node:assert/strict";

import {
  RELATION_TYPES,
  SYMMETRIC_RELATION_TYPES,
  canonicalKey,
  reconcileProductAnalogs,
  validateAnalogEdge,
} from "./reconcile-product-analogs.mjs";

const edge = (from, to, relation_type, overrides = {}) => ({
  id: `row-${from}-${to}-${relation_type}`,
  product_from: from,
  product_to: to,
  relation_type,
  canonical_key: canonicalKey(from, to, relation_type),
  source_name: "manual",
  note: null,
  verified_at: null,
  ...overrides,
});

const liveProduct = (id, status = "published") => ({ id, status });

/**
 * Mock Directus client serving the bounded paged products_analogs scan and the
 * chunked id/status product lookups of the orphan check.
 */
const mockClient = ({ rows = [], products = [] } = {}) => {
  const requests = [];
  return {
    requests,
    async request(path) {
      requests.push({ path });
      if (path.startsWith("/items/products_analogs?")) {
        const params = new URL(path, "https://directus.test").searchParams;
        const page = Number(params.get("page") ?? "1");
        const limit = Number(params.get("limit") ?? "100");
        return rows.slice((page - 1) * limit, page * limit);
      }
      if (path.startsWith("/items/products?")) {
        const params = new URL(path, "https://directus.test").searchParams;
        const ids = (params.get("filter[id][_in]") ?? "").split(",").filter(Boolean);
        return products.filter((product) => ids.includes(product.id));
      }
      return [];
    },
  };
};

test("canonicalKey sorts the id pair for every symmetric type (A->B === B->A)", () => {
  for (const type of SYMMETRIC_RELATION_TYPES) {
    assert.equal(
      canonicalKey("a-product", "b-product", type),
      canonicalKey("b-product", "a-product", type),
      `${type} must be direction-independent`,
    );
  }
});

test("canonicalKey keeps the direction for superseded_by", () => {
  const forward = canonicalKey("a-product", "b-product", "superseded_by");
  const backward = canonicalKey("b-product", "a-product", "superseded_by");

  assert.notEqual(forward, backward);
  assert.equal(forward, "superseded_by:a-product:b-product");
  assert.equal(backward, "superseded_by:b-product:a-product");
});

test("canonicalKey is deterministic and separates relation types of one pair", () => {
  assert.equal(
    canonicalKey("a", "b", "analog"),
    canonicalKey("a", "b", "analog"),
    "same input must produce the same key",
  );
  // The symmetric key always starts from the lexicographically smaller id.
  assert.equal(canonicalKey("b", "a", "oem_cross"), "oem_cross:a:b");
  // Two typed edges between the same pair are DISTINCT rows.
  assert.notEqual(canonicalKey("a", "b", "analog"), canonicalKey("a", "b", "oem_cross"));
  assert.ok(RELATION_TYPES.includes("superseded_by"));
});

test("validateAnalogEdge accepts correctly keyed edges of every type", () => {
  for (const type of RELATION_TYPES) {
    const result = validateAnalogEdge(edge("a", "b", type));
    assert.deepEqual(result, { ok: true, errors: [] }, `${type} must validate`);
  }
});

test("validateAnalogEdge rejects self-edges", () => {
  const result = validateAnalogEdge(edge("a", "a", "analog"));

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("self-edge")));
});

test("validateAnalogEdge rejects unknown relation types", () => {
  const result = validateAnalogEdge(edge("a", "b", "friend_of"));

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("unknown relation_type")));
});

test("validateAnalogEdge rejects a canonical_key that does not match the recomputation", () => {
  const result = validateAnalogEdge(
    edge("b", "a", "analog", { canonical_key: "analog:b:a" }),
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("canonical_key")));
  // The symmetric pair is sorted, so the stored direction-dependent key is wrong.
  assert.ok(result.errors.some((error) => error.includes("analog:a:b")));
});

test("an empty products_analogs table reconciles OK (zero rows is valid)", async () => {
  const client = mockClient({ rows: [], products: [] });

  const result = await reconcileProductAnalogs(client);

  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
  assert.equal(result.summary.rowsTotal, 0);
});

test("a clean instance reconciles OK with counts by relation type", async () => {
  const client = mockClient({
    rows: [
      edge("p1", "p2", "analog"), // current product is the from side
      edge("p3", "p1", "oem_cross"), // current product is the to side
      edge("p1", "p4", "compatible"),
      edge("p1", "p5", "superseded_by"),
      edge("p6", "p1", "superseded_by"), // the reversed supersession is its own edge
    ],
    products: [
      liveProduct("p1"),
      liveProduct("p2"),
      liveProduct("p3"),
      liveProduct("p4"),
      liveProduct("p5"),
      liveProduct("p6"),
    ],
  });

  const result = await reconcileProductAnalogs(client);

  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
  assert.equal(result.summary.rowsTotal, 5);
  assert.deepEqual(result.summary.byType, {
    analog: 1,
    oem_cross: 1,
    compatible: 1,
    superseded_by: 2,
  });
});

test("detects duplicate canonical keys", async () => {
  const duplicate = edge("p1", "p2", "analog");
  const client = mockClient({
    rows: [duplicate, { ...duplicate, id: "row-copy" }],
    products: [liveProduct("p1"), liveProduct("p2")],
  });

  const result = await reconcileProductAnalogs(client);

  assert.equal(result.ok, false);
  assert.ok(
    result.violations.some(
      ({ code }) => code === "duplicate-canonical-key",
    ),
  );
  assert.equal(result.summary.duplicateCanonicalKeys, 1);
});

test("detects mirror rows of symmetric types even with matching keys", async () => {
  // B->A recomputes to the SAME sorted canonical key as A->B, but the raw
  // (from, to) pair proves both physical directions were stored.
  const client = mockClient({
    rows: [edge("p1", "p2", "analog"), edge("p2", "p1", "analog")],
    products: [liveProduct("p1"), liveProduct("p2")],
  });

  const result = await reconcileProductAnalogs(client);

  assert.equal(result.ok, false);
  assert.ok(result.violations.some(({ code }) => code === "mirror-row"));
  assert.equal(result.summary.mirrorRows, 2, "both rows are part of the mirror pair");
});

test("does not treat opposite supersession directions as mirrors", async () => {
  const client = mockClient({
    rows: [edge("p1", "p2", "superseded_by"), edge("p2", "p1", "superseded_by")],
    products: [liveProduct("p1"), liveProduct("p2")],
  });

  const result = await reconcileProductAnalogs(client);

  assert.equal(result.ok, true);
  assert.equal(result.summary.mirrorRows, 0);
});

test("detects self edges and unknown types through the row validation", async () => {
  const client = mockClient({
    rows: [
      edge("p1", "p1", "analog"),
      edge("p1", "p2", "cross_sell", { canonical_key: "cross_sell:p1:p2" }),
    ],
    products: [liveProduct("p1"), liveProduct("p2")],
  });

  const result = await reconcileProductAnalogs(client);

  assert.equal(result.ok, false);
  assert.equal(result.summary.selfEdges, 1);
  assert.equal(result.summary.unknownRelationTypes, 1);
  // Unknown types are reported, never counted into a known bucket.
  assert.equal(result.summary.byType.analog, 1);
});

test("detects orphan edges pointing at missing products", async () => {
  const client = mockClient({
    rows: [edge("p1", "ghost", "analog")],
    products: [liveProduct("p1")], // ghost has no products row
  });

  const result = await reconcileProductAnalogs(client);

  assert.equal(result.ok, false);
  assert.ok(result.violations.some(({ code }) => code === "orphan-edge"));
  assert.equal(result.summary.orphanEdges, 1);
});

test("flags edges whose endpoint product is not published", async () => {
  const client = mockClient({
    rows: [edge("p1", "draft", "analog"), edge("p1", "archived", "compatible")],
    products: [
      liveProduct("p1"),
      liveProduct("draft", "draft"),
      liveProduct("archived", "archived"),
    ],
  });

  const result = await reconcileProductAnalogs(client);

  assert.equal(result.ok, false);
  assert.equal(result.summary.unpublishedEndpoints, 2);
  assert.ok(
    result.violations.every(({ code }) => code === "unpublished-endpoint"),
  );
});

test("scans rows in bounded pages and chunks product lookups (never limit=-1)", async () => {
  const rows = Array.from({ length: 101 }, (_, index) =>
    edge("p1", `p${index + 2}`, "analog"),
  );
  const products = [
    liveProduct("p1"),
    ...rows.map(({ product_to }) => liveProduct(product_to)),
  ];
  const client = mockClient({ rows, products });

  const result = await reconcileProductAnalogs(client);

  assert.equal(result.ok, true);
  assert.equal(result.summary.rowsTotal, 101);
  assert.equal(result.summary.scanPages, 2);

  const scanUrls = client.requests
    .filter(({ path }) => path.startsWith("/items/products_analogs?"))
    .map(({ path }) => new URL(path, "https://directus.test").searchParams);
  assert.equal(scanUrls.length, 2, "101 rows at 100/page");
  for (const params of scanUrls) {
    assert.equal(params.get("limit"), "100");
    assert.notEqual(params.get("limit"), "-1");
  }
  assert.equal(scanUrls[1].get("page"), "2");

  // The orphan lookups stay bounded as well (101 distinct ids -> 2 chunks).
  const lookupUrls = client.requests
    .filter(({ path }) => path.startsWith("/items/products?"))
    .map(({ path }) => new URL(path, "https://directus.test").searchParams);
  assert.equal(lookupUrls.length, 2);
  for (const params of lookupUrls) {
    const ids = (params.get("filter[id][_in]") ?? "").split(",");
    assert.ok(ids.length <= 100, "at most 100 ids per lookup");
    assert.notEqual(params.get("limit"), "-1");
  }
});
