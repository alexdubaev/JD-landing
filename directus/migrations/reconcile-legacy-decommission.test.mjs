import test from "node:test";
import assert from "node:assert/strict";

import { reconcileLegacyDecommission } from "./reconcile-legacy-decommission.mjs";
import { LEGACY_COLLECTIONS } from "./decommission-legacy-collections.mjs";

const KEPT_COLLECTIONS = [
  "site_settings",
  "home_page",
  "pages",
  "page_sections",
  "navigation_items",
  "categories",
  "articles",
  "products",
  "faq_items",
  "lead_forms",
  "leads",
  "contact_channels",
  "recent_supplies",
  "product_images",
  "product_specifications",
  "product_documents",
  "seo_redirects",
  "orders",
  "order_items",
];

const schemaCollections = (names) =>
  names.map((name) => ({ collection: name, schema: { name } }));

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

const beforeBaseline = {
  version: 1,
  counts: {
    collectionCount: 25,
    categories: 18,
    articles: 3,
    pages: 2,
    products: { total: 12971 },
  },
  integrity: { brokenRelations: 0 },
  hashes: {
    products: HASH_A,
    categories: HASH_B,
    articles: HASH_A,
    pages: HASH_B,
    pageSections: HASH_A,
    faqItems: HASH_B,
  },
  details: {
    schema: { collections: schemaCollections([...KEPT_COLLECTIONS, ...LEGACY_COLLECTIONS]) },
    relations: [
      { collection: "hero_blocks", field: "page_section", related_collection: "page_sections" },
      { collection: "products", field: "category", related_collection: "categories" },
    ],
  },
};

const afterBaseline = {
  version: 1,
  counts: {
    collectionCount: 19,
    categories: 18,
    articles: 3,
    pages: 2,
    products: { total: 12971 },
  },
  integrity: { brokenRelations: 0 },
  hashes: {
    products: HASH_A,
    categories: HASH_B,
    articles: HASH_A,
    pages: HASH_B,
    pageSections: HASH_A,
    faqItems: HASH_B,
  },
  details: {
    schema: { collections: schemaCollections(KEPT_COLLECTIONS) },
    relations: [
      { collection: "products", field: "category", related_collection: "categories" },
    ],
  },
};

test("confirms a clean 25 -> 19 decommission", () => {
  const result = reconcileLegacyDecommission(beforeBaseline, afterBaseline);

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.summary.removed.sort(), [...LEGACY_COLLECTIONS].sort());
  assert.deepEqual(result.summary.added, []);
  assert.equal(result.summary.collectionCountBefore, 25);
  assert.equal(result.summary.collectionCountAfter, 19);
  assert.equal(result.expectedPhysicalCollections, 19);
});

test("fails when a legacy collection is still present after apply", () => {
  const after = structuredClone(afterBaseline);
  after.details.schema.collections = schemaCollections([
    ...KEPT_COLLECTIONS,
    "hero_blocks",
  ]);
  after.counts.collectionCount = 20;

  const result = reconcileLegacyDecommission(beforeBaseline, after);

  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some((failure) => failure.code === "unexpected-removal-set"),
  );
});

test("fails when the collection count did not drop by exactly six", () => {
  const after = structuredClone(afterBaseline);
  after.counts.collectionCount = 19;
  // keep collections correct but pretend an extra physical collection exists
  after.details.schema.collections = schemaCollections([
    ...KEPT_COLLECTIONS,
    "stray_collection",
  ]);

  const result = reconcileLegacyDecommission(beforeBaseline, after);

  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some((failure) => failure.code === "unexpected-added-collections"),
  );
});

test("fails when a new broken relation appears after decommission", () => {
  const after = structuredClone(afterBaseline);
  after.integrity.brokenRelations = 1;

  const result = reconcileLegacyDecommission(beforeBaseline, after);

  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some((failure) => failure.code === "new-broken-relation"),
  );
});

test("fails when a kept collection row hash changed", () => {
  const after = structuredClone(afterBaseline);
  after.hashes.products = "c".repeat(64);

  const result = reconcileLegacyDecommission(beforeBaseline, after);

  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some((failure) => failure.code === "kept-collection-changed"),
  );
});

test("fails when an after-state relation still references a legacy collection", () => {
  const after = structuredClone(afterBaseline);
  after.details.relations.push({
    collection: "pages",
    field: "hero",
    related_collection: "hero_blocks",
  });

  const result = reconcileLegacyDecommission(beforeBaseline, after);

  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some((failure) => failure.code === "dangling-legacy-relation"),
  );
});

test("fails when the physical count is not the expected 19", () => {
  const after = structuredClone(afterBaseline);
  after.counts.collectionCount = 18;

  const result = reconcileLegacyDecommission(beforeBaseline, after);

  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some((failure) => failure.code === "physical-collection-count"),
  );
});

test("fails when a target was already absent from the before baseline", () => {
  const before = structuredClone(beforeBaseline);
  before.details.schema.collections = schemaCollections(
    [...KEPT_COLLECTIONS, ...LEGACY_COLLECTIONS.filter((name) => name !== "banners")],
  );
  before.counts.collectionCount = 24;

  const result = reconcileLegacyDecommission(before, afterBaseline);

  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some((failure) => failure.code === "target-missing-before"),
  );
});

test("ignores directus_ system collections when computing physical names", () => {
  const before = structuredClone(beforeBaseline);
  const after = structuredClone(afterBaseline);
  before.details.schema.collections.push({ collection: "directus_users", schema: { name: "directus_users" } });
  after.details.schema.collections.push({ collection: "directus_users", schema: { name: "directus_users" } });

  const result = reconcileLegacyDecommission(before, after);
  assert.equal(result.ok, true);
});
