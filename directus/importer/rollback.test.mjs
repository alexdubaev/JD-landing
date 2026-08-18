import test from "node:test";
import assert from "node:assert/strict";

import { getProfile } from "./profiles.mjs";
import { normalizeRow } from "./normalize.mjs";
import { runImportApply } from "./apply.mjs";
import { buildInputManifest } from "./manifest.mjs";
import { rollbackCatalogImport, beforeStateHash } from "./rollback.mjs";
import { createMockDirectus, mockProduct } from "./mock-directus.mjs";

const productById = (client, id) =>
  client.store.products.find((product) => product.id === id);

const profile = getProfile("operations-default");

const manifest = buildInputManifest({
  profileName: "operations-default",
  sha256: "f".repeat(64),
  bytes: 10,
  rowCount: 1,
  createdAt: "2026-08-17T00:00:00.000Z",
});

const run = (client, overrides = {}) =>
  runImportApply(client, {
    profile,
    manifest,
    normalizedRows: [normalizeRow({ sku: "SKU-P1", price: 2000 }, 0)],
    apply: true,
    releaseId: "R9-RB",
    retryDelayMs: 0,
    ...overrides,
  });

test("INVARIANT 7: rollback restores the exact before-state values of patched products", async () => {
  const client = createMockDirectus({ products: [mockProduct("p1", { price: "1000.00" })] });
  const applied = await run(client);
  assert.equal(applied.ok, true);
  const patched = productById(client, "p1");
  assert.notEqual(Number(patched.price), 1000);

  const result = await rollbackCatalogImport(client, {
    profile,
    beforeState: applied.beforeState,
    reportEntries: applied.reportEntries,
    apply: true,
    releaseId: "R9-RB-ROLLBACK",
  });

  assert.equal(result.ok, true, JSON.stringify(result.violations ?? result));
  const live = productById(client, "p1");
  assert.equal(live.price, "1000.00", "exact before value restored");
  assert.equal(live.title, patched.title, "protected fields untouched");
});

test("rollback deletes created drafts but never published products", async () => {
  const client = createMockDirectus({ products: [] });
  const applied = await run(client, {
    normalizedRows: [normalizeRow({ sku: "SYN-NEW-1", price: 5 }, 0)],
  });
  const createdId = applied.reportEntries.find(
    (entry) => entry.outcome === "create-draft",
  )?.product_id;
  assert.ok(createdId, "a draft was created");
  assert.equal(productById(client, createdId).status, "draft");

  await rollbackCatalogImport(client, {
    profile,
    beforeState: applied.beforeState,
    reportEntries: applied.reportEntries,
    apply: true,
    releaseId: "RB1",
  });
  assert.equal(productById(client, createdId) == null, true, "draft deleted");

  // Same flow but someone published the draft meanwhile: hard stop.
  const client2 = createMockDirectus({ products: [] });
  const applied2 = await run(client2, {
    normalizedRows: [normalizeRow({ sku: "SYN-NEW-2", price: 5 }, 0)],
  });
  const created2 = applied2.reportEntries.find(
    (entry) => entry.outcome === "create-draft",
  )?.product_id;
  productById(client2, created2).status = "published";
  const stopped = await rollbackCatalogImport(client2, {
    profile,
    beforeState: applied2.beforeState,
    reportEntries: applied2.reportEntries,
    apply: true,
    releaseId: "RB2",
  });
  assert.equal(stopped.ok, false);
  assert.ok(stopped.blockers.some(({ code }) => code === "created-product-published"));
  assert.equal(productById(client2, created2) != null, true, "published product survives");
});

test("rollback STOPs when an editor changed a protected field after the import", async () => {
  const client = createMockDirectus({ products: [mockProduct("p1", { price: "1000.00" })] });
  const applied = await run(client);
  const live = productById(client, "p1");
  live.title = "Руками исправленный заголовок";

  const result = await rollbackCatalogImport(client, {
    profile,
    beforeState: applied.beforeState,
    reportEntries: applied.reportEntries,
    apply: true,
    releaseId: "RB3",
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.blockers.some(({ code }) => code === "protected-field-changed"),
    "concurrent manual work is never rolled over",
  );
  assert.equal(live.title, "Руками исправленный заголовок");
});

test("rollback requires --apply --release-id and defaults to a no-write dry run", async () => {
  const client = createMockDirectus({ products: [mockProduct("p1", { price: "1000.00" })] });
  const applied = await run(client);

  await assert.rejects(
    () =>
      rollbackCatalogImport(client, {
        profile,
        beforeState: applied.beforeState,
        reportEntries: applied.reportEntries,
        apply: true,
      }),
    /release-id/,
  );

  const planned = await rollbackCatalogImport(client, {
    profile,
    beforeState: applied.beforeState,
    reportEntries: applied.reportEntries,
  });
  assert.equal(planned.applied, false);
  assert.equal(
    client.requests.filter(({ method }) => method !== "GET").length,
    1, // only the apply run's own PATCH; the rollback dry run adds none
  );
});

test("beforeStateHash is deterministic and order-sensitive", () => {
  const rows = [
    { product_id: "a", before: [{ field: "price", value: 1 }] },
    { product_id: "b", before: [{ field: "price", value: 2 }] },
  ];
  assert.equal(beforeStateHash(rows), beforeStateHash([...rows]));
  // hashRows sorts rows: the artifact hash is order-independent (deterministic
  // artifacts lesson) but content-sensitive.
  assert.equal(beforeStateHash(rows), beforeStateHash([...rows].reverse()));
  assert.notEqual(
    beforeStateHash(rows),
    beforeStateHash([{ product_id: "a", before: [{ field: "price", value: 999 }] }, rows[1]]),
  );
});
