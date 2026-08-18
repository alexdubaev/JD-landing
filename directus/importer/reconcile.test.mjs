import test from "node:test";
import assert from "node:assert/strict";

import { getProfile } from "./profiles.mjs";
import { normalizeRow } from "./normalize.mjs";
import { reconcileCatalogImport } from "./reconcile.mjs";
import { createMockDirectus, mockProduct } from "./mock-directus.mjs";

const productById = (client, id) =>
  client.store.products.find((product) => product.id === id);

const profile = getProfile("operations-default");

test("reconcile passes a fully applied release", async () => {
  const client = createMockDirectus({ products: [mockProduct("p1", { price: "1500.00" })] });
  const result = await reconcileCatalogImport(client, {
    profile,
    normalizedRows: [normalizeRow({ sku: "SKU-P1", price: 1500 }, 0)],
    beforeState: [],
    reportEntries: [],
  });
  assert.equal(result.ok, true, JSON.stringify(result.violations));
  assert.equal(result.summary.rows.patch, 0, "re-planning yields only skips");
});

test("flags an interrupted apply as incomplete", async () => {
  const client = createMockDirectus({ products: [mockProduct("p1", { price: "1000.00" })] });
  const result = await reconcileCatalogImport(client, {
    profile,
    normalizedRows: [normalizeRow({ sku: "SKU-P1", price: 1500 }, 0)],
    beforeState: [],
    reportEntries: [],
  });
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(({ code }) => code === "incomplete-apply"));
});

test("flags created products that are no longer drafts", async () => {
  const client = createMockDirectus({ products: [mockProduct("p1", { price: "1000.00" })] });
  const result = await reconcileCatalogImport(client, {
    profile,
    normalizedRows: [normalizeRow({ sku: "SKU-P1", price: 1000 }, 0)],
    beforeState: [],
    reportEntries: [{ outcome: "create-draft", product_id: "p1" }],
  });
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(({ code }) => code === "created-not-draft"));
});

test("flags created products that disappeared", async () => {
  const client = createMockDirectus({ products: [mockProduct("p1", { price: "1000.00" })] });
  const result = await reconcileCatalogImport(client, {
    profile,
    normalizedRows: [normalizeRow({ sku: "SKU-P1", price: 1000 }, 0)],
    beforeState: [],
    reportEntries: [{ outcome: "create-draft", product_id: "ghost" }],
  });
  assert.ok(result.violations.some(({ code }) => code === "created-product-missing"));
});

test("flags protected-field drift against the before-state", async () => {
  const client = createMockDirectus({ products: [mockProduct("p1", { title: "Original" })] });
  const { protectedRowHash } = await import("./apply.mjs");
  const beforeHash = protectedRowHash({ ...mockProduct("p1"), title: "Original" }, profile);
  productById(client, "p1").title = "Changed by hand";
  const result = await reconcileCatalogImport(client, {
    profile,
    normalizedRows: [normalizeRow({ sku: "SKU-P1", price: 1000 }, 0)],
    beforeState: [
      {
        product_id: "p1",
        before: [{ field: "price", value: 1000 }],
        protected_sha256: beforeHash,
      },
    ],
    reportEntries: [],
  });
  // price matches so no incomplete-apply; the drift is the protected title
  assert.ok(
    result.violations.some(({ code }) => code === "protected-field-changed"),
  );
});
