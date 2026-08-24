import test from "node:test";
import assert from "node:assert/strict";

import { PROFILES, getProfile } from "./profiles.mjs";
import { normalizeRow } from "./normalize.mjs";
import {
  PLAN_OUTCOMES,
  buildPlans,
  diffAllowedFields,
  forbiddenInputKeys,
  planArtifactEntry,
  valuesEqual,
} from "./plan.mjs";

const profile = getProfile("operations-default");

const existingProduct = (id, overrides = {}) => ({
  id,
  status: "published",
  sku: `SYN-${id}`,
  price: "1000.00",
  price_status: "fixed",
  availability_status: "on_request",
  delivery_status: null,
  source_name: "old-feed",
  source_url: null,
  verified_at: "2026-08-01T00:00:00.000Z",
  title: "Synthetic title",
  slug: `syn-${id}`,
  category: { id: "cat-1" },
  main_image: "file-1",
  gallery: ["file-1"],
  ...overrides,
});

const indexProducts = (products) => {
  const bySkuKey = new Map();
  for (const product of products) {
    bySkuKey.set(
      String(product.sku).toUpperCase().replace(/[^A-Z0-9]/g, ""),
      product,
    );
  }
  return bySkuKey;
};

const planRows = (rawRows, products, edgeKeys = [], useProfile = profile) =>
  buildPlans({
    normalizedRows: rawRows.map((row, index) => normalizeRow(row, index)),
    bySkuKey: indexProducts(products),
    edgeKeys,
    profile: useProfile,
  });

test("INVARIANT 1: forbidden fields become conflicts even when the value already matches (default profile)", () => {
  const product = existingProduct("0001");
  const forbiddenKeys = [
    "title",
    "category",
    "slug",
    "seo_title",
    "seo_description",
    "og_image",
    "image_alt",
    "gallery",
    "main_image",
    "mpn",
    "status",
    "currency",
  ];
  for (const key of forbiddenKeys) {
    const currentValue =
      key === "category" ? "cat-1" : product[key] ?? "matching-value";
    const { plans } = planRows(
      [{ sku: product.sku, price: 2000, [key]: currentValue }],
      [product],
    );
    assert.equal(plans[0].outcome, "conflict", `${key} must conflict`);
    assert.deepEqual(plans[0].forbiddenFields, [key]);
  }

  // A matching title still conflicts: presence of a forbidden key is the
  // conflict, not the value.
  const matching = planRows(
    [{ sku: product.sku, title: product.title }],
    [product],
  );
  assert.equal(matching.plans[0].outcome, "conflict");
  assert.deepEqual(matching.plans[0].forbiddenFields, ["title"]);
  assert.equal(matching.summary.conflict, 1);
});

test("forbiddenInputKeys flags unknown columns but never sku", () => {
  const keys = forbiddenInputKeys(getProfile("operations-default"), {
    sku: "A",
    price: 1,
    title: "t",
    warehouse_note: "x",
  }, { isNew: false });
  assert.deepEqual(keys, ["title", "warehouse_note"]);
  // On a NEW row the incoming status is forced to draft, not forbidden.
  const createKeys = forbiddenInputKeys(getProfile("operations-default"), {
    sku: "A",
    price: 1,
    status: "published",
  }, { isNew: true });
  assert.deepEqual(createKeys, []);
});

test("INVARIANT 3: minimal diff — unchanged allowed fields stay out of the PATCH and fully-unchanged rows skip", () => {
  const product = existingProduct("0002", { price: "1500.00" });
  const { plans } = planRows(
    [
      // price differs, price_status/availability identical -> only price.
      {
        sku: product.sku,
        price: 1599,
        price_status: "fixed",
        availability_status: "on_request",
      },
      // everything identical -> skip.
      { sku: product.sku, price: "1 500,0", price_status: "fixed" },
    ],
    [product, product],
  );

  assert.equal(plans[0].outcome, "patch-minimal-diff");
  assert.deepEqual(plans[0].patch, { price: 1599 });
  assert.deepEqual(plans[0].changedFields, ["price"]);
  assert.deepEqual(plans[0].unchangedFields, [
    "price_status",
    "availability_status",
  ]);

  assert.equal(plans[1].outcome, "skip");
  assert.deepEqual(plans[1].patch, {});
});

test("diffAllowedFields compares decimals as numbers and timestamps by instant", () => {
  const product = existingProduct("0003", { price: "1500.00" });
  const diff = diffAllowedFields(
    profile,
    { price: 1500, verified_at: "2026-08-01T02:00:00+02:00" },
    product,
  );
  assert.deepEqual(diff.patch, {});
  assert.deepEqual(diff.changedFields, []);

  const changed = diffAllowedFields(
    profile,
    { price: 1500.01, verified_at: "2026-08-02" },
    product,
  );
  assert.deepEqual(changed.patch, {
    price: 1500.01,
    verified_at: "2026-08-02T00:00:00.000Z",
  });
});

test("valuesEqual handles null/undefined coercion and gallery JSON", () => {
  assert.equal(valuesEqual("source_url", null, undefined), true);
  assert.equal(valuesEqual("source_url", "x", null), false);
  assert.equal(valuesEqual("gallery", ["a", "b"], ["a", "b"]), true);
  assert.equal(valuesEqual("gallery", [], null), true);
  assert.equal(valuesEqual("price", 1000, "1000.00"), true);
  assert.equal(valuesEqual("price", 1000, "1000.01"), false);
  assert.equal(valuesEqual("verified_at", null, null), true);
});

test("INVARIANT 4: new products are created as draft and incoming published is forced to draft", () => {
  const { plans } = planRows(
    [
      { sku: "SYN-NEW-1", price: 500, status: "published" },
      { sku: "SYN-NEW-2", price: 600, status: "draft" },
      { sku: "SYN-NEW-3", price: 700 },
    ],
    [],
  );
  assert.equal(plans[0].outcome, "create-draft");
  assert.equal(plans[0].createPayload.status, "draft");
  assert.equal(plans[0].statusForcedToDraft, true, "published forced to draft");

  assert.equal(plans[1].outcome, "create-draft");
  assert.equal(plans[1].createPayload.status, "draft");
  assert.equal(plans[1].statusForcedToDraft, false);

  assert.equal(plans[2].outcome, "create-draft");
  // No status key is invented at the PLAN layer when the row carried none;
  // the APPLY layer guarantees status=draft on the POST (proven in
  // apply.test.mjs "INVARIANT 4 end-to-end").
  assert.equal(plans[2].createPayload.status, undefined, "no status invented when absent");
  assert.equal(plans[2].createPayload.sku, "SYN-NEW-3");
});

test("create payloads carry only allowlisted fields plus draft status and sku", () => {
  const editorial = getProfile("editorial-opt-in");
  const { plans } = planRows(
    [
      {
        sku: "SYN-NEW-9",
        status: "published",
        price: 1,
        title: "T",
        short_description: "S",
        full_description: "F",
        image_alt: "A",
      },
    ],
    [],
    [],
    editorial,
  );
  const payload = plans[0].createPayload;
  assert.deepEqual(Object.keys(payload).sort(), [
    "full_description",
    "image_alt",
    "price",
    "short_description",
    "sku",
    "status",
    "title",
  ]);
  assert.equal(payload.status, "draft");
});

test("invalid rows become recorded conflicts with typed reasons", () => {
  const { plans, summary } = planRows(
    [
      { price: 10 },
      { sku: "SYN-0001", price: "free" },
    ],
    [],
  );
  assert.equal(plans[0].outcome, "conflict");
  assert.deepEqual(plans[0].conflictCodes, ["missing-sku"]);
  assert.equal(plans[1].outcome, "conflict");
  assert.deepEqual(plans[1].conflictCodes, ["invalid-value"]);
  assert.equal(summary.conflict, 2);
});

test("analogs planning is idempotent, direction-safe and rejects junk loudly", () => {
  const analogsProfile = getProfile("analogs-opt-in");
  const products = [
    existingProduct("0001"),
    existingProduct("0002"),
    existingProduct("0003", { price: "3000.00" }),
    existingProduct("0004", { price: "4000.00" }),
  ];
  const { plans, summary } = planRows(
    [
      // New edge 1-2.
      { sku: "SYN-0001", price: 1111, analogs: [{ sku: "SYN-0002", relation_type: "analog" }] },
      // Mirror of the same edge: same canonical key -> not planned twice.
      { sku: "SYN-0002", price: 2222, analogs: [{ sku: "SYN-0001", relation_type: "analog" }] },
      // Self edge -> conflict.
      { sku: "SYN-0004", price: 4444, analogs: [{ sku: "SYN-0004", relation_type: "analog" }] },
      // Unknown target + unknown type -> conflict.
      {
        sku: "SYN-0003",
        price: 3333,
        analogs: [
          { sku: "SYN-9999", relation_type: "analog" },
          { sku: "SYN-0001", relation_type: "bogus" },
        ],
      },
    ],
    products,
    [],
    analogsProfile,
  );

  assert.equal(plans[0].outcome, "patch-minimal-diff");
  assert.equal(plans[0].edges.length, 1);
  const [first, second] = [plans[0].edges[0], plans[1]];
  assert.equal(second.outcome, "patch-minimal-diff");
  assert.equal(second.edges.length, 0, "mirror edge deduplicated by canonical key");
  assert.equal(plans[0].edges[0].canonical_key, first.canonical_key);

  assert.equal(plans[2].outcome, "conflict");
  assert.deepEqual(plans[2].conflictCodes, ["analog-self-edge"]);

  assert.equal(plans[3].outcome, "conflict");
  assert.deepEqual(plans[3].conflictCodes, [
    "analog-target-missing",
    "analog-invalid-type",
  ]);
  assert.equal(summary.edgesPlanned, 1);

  // analogs on a NEW product cannot be planned (own id unknown) -> loud conflict.
  const created = planRows(
    [{ sku: "SYN-BRAND-NEW", analogs: [{ sku: "SYN-0001", relation_type: "analog" }] }],
    products,
    [],
    analogsProfile,
  );
  assert.equal(created.plans[0].outcome, "conflict");
  assert.deepEqual(created.plans[0].conflictCodes, ["analog-on-create-unsupported"]);
});

test("the plan is deterministic for identical rows and state", () => {
  const products = [existingProduct("0001"), existingProduct("0002", { price: "2000.00" })];
  const rawRows = [
    { sku: "SYN-0001", price: 1111 },
    { sku: "SYN-0002", price: 2222 },
    { sku: "SYN-0003", price: 3333 },
    { sku: "SYN-0004", title: "forbidden" },
  ];
  const first = planRows(rawRows, products);
  const second = planRows(rawRows, products);
  assert.deepEqual(first, second);
  assert.deepEqual([...PLAN_OUTCOMES], [
    "create-draft",
    "patch-minimal-diff",
    "skip",
    "conflict",
  ]);
});

test("planArtifactEntry redacts all values and SKUs", () => {
  const products = [existingProduct("0001")];
  const { plans } = planRows(
    [
      { sku: "SYN-0001", price: 4242 },
      { sku: "SYN-NEW", price: 99, status: "published" },
      { sku: "SYN-0002", title: "nope" },
    ],
    products,
  );
  const artifact = plans.map(planArtifactEntry);
  const serialized = JSON.stringify(artifact);
  assert.equal(artifact[0].outcome, "patch-minimal-diff");
  assert.deepEqual(artifact[0].fields, ["price"]);
  assert.equal(artifact[1].outcome, "create-draft");
  assert.equal(artifact[1].forced_draft, true);
  assert.deepEqual(artifact[2].forbidden_fields, ["title"]);
  assert.ok(!serialized.includes("4242"), "no price values in artifacts");
  assert.ok(!serialized.includes("SYN-0001"), "no SKUs in artifacts");
  assert.ok(!serialized.includes("nope"), "no text values in artifacts");
  assert.ok(!("patch" in artifact[0]) && !("createPayload" in artifact[1]));
});

test("every profile produces only the four contract outcomes", () => {
  for (const name of Object.keys(PROFILES)) {
    const { summary } = planRows(
      [{ sku: "SYN-0001", price: 5555 }],
      [existingProduct("0001")],
      [],
      PROFILES[name],
    );
    assert.equal(summary.total, 1);
    assert.equal(
      summary.create + summary.patch + summary.skip + summary.conflict,
      1,
      `${name} outcomes must partition the rows`,
    );
  }
});
