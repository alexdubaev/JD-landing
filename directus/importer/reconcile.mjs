// Task 13 (R9): post-apply reconciliation for the catalog importer.
//
// Re-reads the live catalog (paged, allowlisted fields only) and proves:
// - the same input now re-plans as 100% skip/conflict (no create or patch
//   remains — an incomplete/interrupted apply is a violation);
// - every product the report says was CREATED still has status "draft"
//   (an import may never publish, ADR-003);
// - the protected fields of every before-state product are byte-identical
//   (protected_sha256 comparison — title/slug/category/SEO/media/currency
//   were never touched);
// - every field actually written (from the append-only report) is inside
//   the profile allowlist (forbidden-field audit).
//
// Pure checks + thin CLI; no writes. Exits non-zero on violations.

import { readFile } from "node:fs/promises";

import { DirectusAdminClient, isMainModule } from "../schema/apply-schema.mjs";
import { getProfile } from "./profiles.mjs";
import { normalizeRow } from "./normalize.mjs";
import {
  BEFORE_STATE_ARTIFACT_NAME,
  MANIFEST_ARTIFACT_NAME,
  REPORT_ARTIFACT_NAME,
  readInputFile,
  readNdjsonFile,
  verifyManifestInput,
} from "./manifest.mjs";
import { buildPlans } from "./plan.mjs";
import { collectImporterState, protectedRowHash } from "./apply.mjs";

const CREATED_OUTCOMES = new Set(["create-draft"]);

export async function reconcileCatalogImport(
  client,
  { profile, normalizedRows, beforeState, reportEntries, pageSize } = {},
) {
  const state = await collectImporterState(client, { profile, pageSize });
  const { plans, summary: planSummary } = buildPlans({
    normalizedRows,
    bySkuKey: state.bySkuKey,
    edgeKeys: state.edgeKeys,
    profile,
  });

  const violations = [];

  const incomplete = plans.filter(
    (plan) =>
      plan.outcome === "create-draft" || plan.outcome === "patch-minimal-diff",
  );
  if (incomplete.length > 0) {
    violations.push({
      code: "incomplete-apply",
      detail: `${incomplete.length} row(s) still plan a write — the apply did not complete (interrupted runs must be resumed)`,
    });
  }

  let createdChecked = 0;
  let draftConfirmed = 0;
  for (const entry of reportEntries ?? []) {
    if (!CREATED_OUTCOMES.has(entry.outcome) || !entry.product_id) continue;
    createdChecked += 1;
    const live = state.productsById.get(String(entry.product_id));
    if (!live) {
      violations.push({
        code: "created-product-missing",
        detail: `product ${entry.product_id} from the apply report no longer exists`,
      });
      continue;
    }
    if (live.status !== "draft") {
      violations.push({
        code: "created-not-draft",
        detail: `product ${entry.product_id} has status "${live.status}" — an import may never publish`,
      });
      continue;
    }
    draftConfirmed += 1;
  }

  let protectedChecked = 0;
  for (const row of beforeState ?? []) {
    const live = state.productsById.get(String(row.product_id));
    if (!live) {
      violations.push({
        code: "before-state-product-missing",
        detail: `before-state product ${row.product_id} no longer exists`,
      });
      continue;
    }
    protectedChecked += 1;
    if (protectedRowHash(live, profile) !== row.protected_sha256) {
      violations.push({
        code: "protected-field-changed",
        detail: `protected fields of product ${row.product_id} differ from the before-state`,
      });
    }
  }

  const allowed = new Set(profile.fields);
  let writesAudited = 0;
  for (const entry of reportEntries ?? []) {
    for (const field of entry.fields ?? []) {
      writesAudited += 1;
      if (!allowed.has(field)) {
        violations.push({
          code: "forbidden-field-write",
          detail: `report entry offset ${entry.offset} wrote field "${field}" outside the ${profile.name} allowlist`,
        });
      }
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    summary: {
      profile: profile.name,
      rows: planSummary,
      createdChecked,
      draftConfirmed,
      protectedChecked,
      writesAudited,
      productPages: state.productPages,
      edgePages: state.edgePages,
    },
  };
}

const argumentValue = (name, args = process.argv.slice(2)) => {
  const prefix = `--${name}=`;
  return args.find((value) => value.startsWith(prefix))?.slice(prefix.length);
};

async function main() {
  const outputDirectory = argumentValue("output") ?? process.env.JD_RELEASE_DIR;
  const inputPath = argumentValue("input");
  if (!outputDirectory) throw new Error("Set --output or JD_RELEASE_DIR");
  if (!inputPath) throw new Error("Set --input=<ndjson> (the release input file)");

  const manifest = JSON.parse(
    await readFile(`${outputDirectory}/${MANIFEST_ARTIFACT_NAME}`, "utf8"),
  );
  const profile = getProfile(manifest.profile);
  const beforeState = (
    await readNdjsonFile(`${outputDirectory}/${BEFORE_STATE_ARTIFACT_NAME}`)
  ).rows;
  const reportEntries = (
    await readNdjsonFile(`${outputDirectory}/${REPORT_ARTIFACT_NAME}`)
  ).rows;

  const input = await readInputFile(inputPath);
  const verification = verifyManifestInput(manifest, {
    sha256: input.sha256,
    bytes: input.bytes,
    rowCount: input.rowCount,
  });
  if (!verification.ok) {
    throw new Error(
      `input file changed since the release manifest (${verification.mismatches.join("; ")})`,
    );
  }

  const client = await DirectusAdminClient.connectFromEnvironment();
  const normalizedRows = input.rows.map((row, index) => normalizeRow(row, index));
  const result = await reconcileCatalogImport(client, {
    profile,
    normalizedRows,
    beforeState,
    reportEntries,
  });

  const s = result.summary;
  console.log(
    `Reconciled catalog import (${s.profile}): ${s.rows.total} row(s) — ` +
      `${s.rows.create} create, ${s.rows.patch} patch, ${s.rows.skip} skip, ${s.rows.conflict} conflict remaining.`,
  );
  console.log(
    `- created checked: ${s.createdChecked} (draft confirmed: ${s.draftConfirmed}), protected checked: ${s.protectedChecked}, writes audited: ${s.writesAudited}`,
  );
  if (!result.ok) {
    console.error(`Reconciliation FAILED with ${result.violations.length} violation(s):`);
    for (const violation of result.violations) {
      console.error(`- [${violation.code}] ${violation.detail}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log("Reconciliation OK.");
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
