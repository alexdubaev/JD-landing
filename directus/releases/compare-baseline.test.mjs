import assert from "node:assert/strict";
import test from "node:test";

import { compareBaseline } from "./compare-baseline.mjs";

const baseline = (overrides = {}) => ({
  version: 1,
  counts: {
    products: {
      total: 12_971,
      published: 12_971,
      galleryProducts: 283,
      galleryReferences: 1_251,
      missingCategory: 0,
      missingMainImage: 12_688,
    },
    categories: 18,
    articles: 3,
    pages: 2,
    pageSections: 13,
    faqItems: 12,
    leads: 4,
    orders: 0,
    collectionCount: 25,
  },
  hashes: {
    products: "a".repeat(64),
    categories: "b".repeat(64),
    articles: "c".repeat(64),
    pages: "d".repeat(64),
    pageSections: "e".repeat(64),
    faqItems: "f".repeat(64),
  },
  integrity: { brokenRelations: 0 },
  metadata: {
    collections: { count: 25, sha256: "1".repeat(64) },
    fields: { count: 100, sha256: "2".repeat(64) },
    relations: { count: 20, sha256: "3".repeat(64) },
    flows: { count: 1, sha256: "4".repeat(64) },
    presets: { count: 10, sha256: "5".repeat(64) },
    permissions: { count: 20, sha256: "6".repeat(64) },
  },
  ...overrides,
});

test("accepts an unchanged baseline with production invariants", () => {
  const before = baseline();
  const result = compareBaseline(before, structuredClone(before), {
    expectedCounts: {
      products: 12_971,
      publishedProducts: 12_971,
      galleryProducts: 283,
      galleryReferences: 1_251,
      categories: 18,
      articles: 3,
      pages: 2,
      pageSections: 13,
      faqItems: 12,
      leads: 4,
      collectionCount: 25,
    },
  });

  assert.deepEqual(result, { ok: true, failures: [], changes: [] });
});

test("fails on product loss and unexpected depublication", () => {
  const before = baseline();
  const after = baseline();
  after.counts.products.total = 12_970;
  after.counts.products.published = 12_969;

  const result = compareBaseline(before, after);

  assert.equal(result.ok, false);
  assert.deepEqual(result.failures.slice(0, 2).map(({ code }) => ({ code })), [
    { code: "product-loss" },
    { code: "unexpected-depublication" },
  ]);
  assert.deepEqual(
    result.failures.slice(2).map(({ path }) => path),
    ["counts.products.total", "counts.products.published"],
  );
});

test("fails when a protected category changes outside release scope", () => {
  const before = baseline();
  const after = baseline();
  after.hashes.categories = "7".repeat(64);

  const blocked = compareBaseline(before, after, { allowedCollections: [] });
  const allowed = compareBaseline(before, after, {
    allowedCollections: ["categories"],
  });

  assert.equal(blocked.ok, false);
  assert.equal(blocked.failures[0].code, "protected-collection-changed");
  assert.equal(allowed.ok, true);
  assert.deepEqual(allowed.changes, [{ collection: "categories", kind: "hash" }]);
});

test("fails when new broken relations appear", () => {
  const before = baseline();
  const after = baseline({ integrity: { brokenRelations: 2 } });

  const result = compareBaseline(before, after);

  assert.equal(result.ok, false);
  assert.equal(result.failures[0].code, "broken-relation");
});

test("fails when a declared production invariant does not match", () => {
  const result = compareBaseline(baseline(), baseline(), {
    expectedCounts: { categories: 19 },
  });

  assert.equal(result.ok, false);
  assert.equal(result.failures[0].code, "invariant-mismatch");
  assert.equal(result.failures[0].path, "counts.categories");
});

test("fails on protected metadata drift and records allowed metadata changes", () => {
  const before = baseline();
  const after = baseline();
  after.metadata.relations.sha256 = "8".repeat(64);

  const blocked = compareBaseline(before, after);
  const allowed = compareBaseline(before, after, {
    allowedMetadata: ["relations"],
  });

  assert.equal(blocked.ok, false);
  assert.equal(blocked.failures[0].code, "protected-metadata-changed");
  assert.equal(allowed.ok, true);
  assert.deepEqual(allowed.changes, [{ metadata: "relations", kind: "hash" }]);
});

test("rejects malformed baselines instead of reporting a false success", () => {
  const result = compareBaseline({ version: 1 }, baseline());

  assert.equal(result.ok, false);
  assert.equal(result.failures[0].code, "invalid-baseline");
  assert.equal(result.failures[0].side, "before");
});

test("rejects baselines missing counts or required metadata sections", () => {
  const missingCounts = baseline();
  delete missingCounts.counts.products.galleryReferences;
  const missingMetadata = baseline();
  delete missingMetadata.metadata.permissions;

  assert.equal(compareBaseline(missingCounts, baseline()).failures[0].path, "counts.products.galleryReferences");
  assert.equal(compareBaseline(missingMetadata, baseline()).failures[0].path, "metadata.permissions");
});

test("enforces known production counts by default", () => {
  const wrong = baseline();
  wrong.counts.categories = 17;

  const result = compareBaseline(wrong, structuredClone(wrong));

  assert.equal(result.ok, false);
  assert.equal(result.failures[0].code, "invariant-mismatch");
  assert.equal(result.failures[0].path, "counts.categories");
});

test("rejects negative counts and malformed SHA-256 hashes", () => {
  const negative = baseline();
  negative.counts.products.missingCategory = -1;
  const emptyCollectionHash = baseline();
  emptyCollectionHash.hashes.products = "";
  const malformedMetadataHash = baseline();
  malformedMetadataHash.metadata.fields.sha256 = "not-a-sha256";

  assert.equal(compareBaseline(negative, baseline()).failures[0].path, "counts.products.missingCategory");
  assert.equal(compareBaseline(emptyCollectionHash, baseline()).failures[0].path, "hashes.products");
  assert.equal(compareBaseline(malformedMetadataHash, baseline()).failures[0].path, "metadata.fields");
});
