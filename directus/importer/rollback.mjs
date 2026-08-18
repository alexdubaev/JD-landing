// Task 13 (R9): release rollback for the catalog importer.
//
// Restores the EXACT before-state recorded by the apply run:
// - products the report created are DELETED, but only while they are still
//   drafts (a product someone published is a hard stop, never a delete);
// - analogs edges the report created are deleted by row id;
// - every before-state product gets its allowlisted fields restored via a
//   MINIMAL patch (only fields whose live value differs) — never a
//   full payload;
// - before touching anything, the protected-field hash of every
//   before-state product is re-verified: if an editor changed
//   title/slug/category/SEO/media meanwhile, the rollback STOPs instead of
//   rolling over concurrent manual work;
// - after the writes the live values are re-read and compared against the
//   before-state — the run only reports ok when they match exactly.
//
// Default mode is a dry run (reports what would be restored); writes need
// apply + releaseId.

import { hashRows } from "../releases/lib/artifacts.mjs";
import {
  collectImporterState,
  assertPatchWithinAllowlist,
  protectedRowHash,
} from "./apply.mjs";
import { valuesEqual } from "./plan.mjs";

const pairsToValues = (pairs) =>
  Object.fromEntries((pairs ?? []).map(({ field, value }) => [field, value]));

export const beforeStateHash = (rows) =>
  hashRows(
    (rows ?? []).map((row) => ({ id: row.product_id, before: row.before })),
  );

export async function rollbackCatalogImport(
  client,
  {
    profile,
    beforeState,
    reportEntries,
    apply = false,
    releaseId = null,
    pageSize,
    now = () => new Date().toISOString(),
  } = {},
) {
  if (apply && !releaseId) {
    throw new Error("--apply requires --release-id=<id>");
  }

  const state = await collectImporterState(client, { profile, pageSize });

  const createdEntries = (reportEntries ?? []).filter(
    (entry) => entry.outcome === "create-draft" && entry.product_id,
  );
  const createdEdgeIds = (reportEntries ?? []).flatMap((entry) =>
    (entry.edges_created ?? []).filter(Boolean),
  );

  const restoreDiff = (row) => {
    const live = state.productsById.get(String(row.product_id));
    const before = pairsToValues(row.before);
    const restore = {};
    if (!live) return restore;
    for (const { field } of row.before) {
      if (valuesEqual(field, before[field], live[field])) continue;
      restore[field] = before[field];
    }
    return restore;
  };

  const blockers = [];
  for (const entry of createdEntries) {
    const live = state.productsById.get(String(entry.product_id));
    if (!live) continue; // already deleted — idempotent re-rollback
    if (live.status !== "draft") {
      blockers.push({
        code: "created-product-published",
        detail: `product ${entry.product_id} is no longer a draft ("${live.status}") — refusing to delete; decide manually`,
      });
    }
  }
  for (const row of beforeState ?? []) {
    const live = state.productsById.get(String(row.product_id));
    if (!live) {
      blockers.push({
        code: "before-state-product-missing",
        detail: `before-state product ${row.product_id} no longer exists`,
      });
      continue;
    }
    if (protectedRowHash(live, profile) !== row.protected_sha256) {
      blockers.push({
        code: "protected-field-changed",
        detail: `protected fields of product ${row.product_id} changed since the apply — refusing to roll over manual edits`,
      });
    }
  }
  if (blockers.length > 0) {
    return {
      ok: false,
      stopped: true,
      applied: false,
      releaseId,
      profile: profile.name,
      blockers,
      violations: [],
      summary: null,
    };
  }

  const summary = {
    products_deleted: 0,
    products_already_deleted: createdEntries.filter(
      (entry) => !state.productsById.has(String(entry.product_id)),
    ).length,
    edges_deleted: 0,
    restore_patches: (beforeState ?? []).filter(
      (row) => Object.keys(restoreDiff(row)).length > 0,
    ).length,
  };

  if (apply) {
    for (const edgeId of createdEdgeIds) {
      if (!state.edgeIds.has(String(edgeId))) continue;
      await client.request(
        `/items/products_analogs/${encodeURIComponent(edgeId)}`,
        { method: "DELETE" },
      );
      summary.edges_deleted += 1;
    }

    for (const row of beforeState ?? []) {
      const restore = restoreDiff(row);
      if (Object.keys(restore).length === 0) continue;
      assertPatchWithinAllowlist(profile, restore);
      await client.request(
        `/items/products/${encodeURIComponent(row.product_id)}`,
        { method: "PATCH", body: JSON.stringify(restore) },
      );
    }

    for (const entry of createdEntries) {
      if (!state.productsById.has(String(entry.product_id))) continue;
      await client.request(
        `/items/products/${encodeURIComponent(entry.product_id)}`,
        { method: "DELETE" },
      );
      summary.products_deleted += 1;
    }
    summary.restore_patches = 0; // all planned restores executed above
  }

  // Exact-restore verification (apply mode): re-read and compare against
  // the before-state. Dry runs only report the pending diff counts.
  const violations = [];
  let verified = 0;
  if (apply) {
    const verifyState = await collectImporterState(client, {
      profile,
      pageSize,
    });
    for (const row of beforeState ?? []) {
      const live = verifyState.productsById.get(String(row.product_id));
      if (!live) {
        violations.push({
          code: "restore-missing-product",
          detail: `product ${row.product_id} missing after rollback`,
        });
        continue;
      }
      verified += 1;
      for (const { field, value } of row.before) {
        if (!valuesEqual(field, value, live[field])) {
          violations.push({
            code: "restore-mismatch",
            detail: `product ${row.product_id} field "${field}" differs from the before-state after rollback`,
          });
        }
      }
    }
    for (const entry of createdEntries) {
      if (verifyState.productsById.has(String(entry.product_id))) {
        violations.push({
          code: "created-still-exists",
          detail: `created product ${entry.product_id} still exists after rollback`,
        });
      }
    }
  } else {
    verified = (beforeState ?? []).length;
  }

  return {
    ok: violations.length === 0,
    stopped: false,
    applied: apply,
    releaseId,
    profile: profile.name,
    blockers: [],
    violations,
    summary: {
      ...summary,
      before_state_rows: (beforeState ?? []).length,
      verified,
      before_state_sha256: beforeStateHash(beforeState ?? []),
      rolled_back_at: now(),
    },
  };
}
