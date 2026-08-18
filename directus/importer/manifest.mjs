// Task 13 (R9): immutable input manifest for the catalog importer.
//
// The manifest pins the EXACT input a plan/apply run was built from:
// file sha256 + byte length + row count + profile + creation timestamp.
// It is deep-frozen, validated on construction, and re-verified before any
// apply or resume — a mutated input file (same path, different bytes) is a
// hard stop instead of a silent plan drift.
//
// This module also owns the release-dir artifact names shared by
// apply/reconcile/rollback, plus the generic NDJSON reader used for input
// files and release artifacts.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { normalizeCode } from "./normalize.mjs";

export const MANIFEST_VERSION = 1;

export const MANIFEST_ARTIFACT_NAME = "catalog-import-manifest.json";
export const PLAN_ARTIFACT_NAME = "catalog-import-plan.json";
export const BEFORE_STATE_ARTIFACT_NAME = "catalog-import-before-state.ndjson";
export const REPORT_ARTIFACT_NAME = "catalog-import-apply-report.ndjson";
export const SUMMARY_ARTIFACT_NAME = "catalog-import-summary.json";

const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
};

export const sha256Hex = (content) =>
  createHash("sha256").update(String(content), "utf8").digest("hex");

const parseNdjsonContent = (content) => {
  const rows = [];
  const errors = [];
  String(content)
    .split(/\r?\n/)
    .forEach((line, index) => {
      if (line.trim() === "") return;
      try {
        rows.push(JSON.parse(line));
      } catch (error) {
        errors.push({ line: index + 1, message: error.message });
      }
    });
  return { rows, errors };
};

/**
 * Reads an NDJSON file: one JSON object per non-empty line. Unparseable
 * lines are reported with their 1-based line number instead of being
 * skipped silently.
 */
export async function readNdjsonFile(filename) {
  return parseNdjsonContent(await readFile(filename, "utf8"));
}

/** Reads the raw input file and derives its immutable fingerprint. */
export async function readInputFile(inputPath) {
  const content = await readFile(inputPath, "utf8");
  const { rows, errors } = parseNdjsonContent(content);
  return {
    content,
    sha256: sha256Hex(content),
    bytes: Buffer.byteLength(content, "utf8"),
    rowCount: rows.length,
    rows,
    errors,
  };
}

/** Duplicate normalized SKU keys make the row→product mapping ambiguous. */
export function findDuplicateSkuKeys(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = normalizeCode(row?.sku);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .sort();
}

/**
 * Builds the frozen manifest. `createdAt` is injectable so tests get
 * deterministic artifacts; production passes new Date().toISOString().
 */
export function buildInputManifest({
  profileName,
  sha256,
  bytes,
  rowCount,
  createdAt,
}) {
  if (!profileName || typeof profileName !== "string") {
    throw new Error("manifest requires a profile name");
  }
  if (!/^[0-9a-f]{64}$/.test(sha256 ?? "")) {
    throw new Error("manifest requires the input file sha256 hex digest");
  }
  if (!Number.isInteger(bytes) || bytes < 0) {
    throw new Error("manifest requires a non-negative byte count");
  }
  if (!Number.isInteger(rowCount) || rowCount < 0) {
    throw new Error("manifest requires a non-negative row count");
  }
  return deepFreeze({
    version: MANIFEST_VERSION,
    tool: "directus/importer",
    profile: profileName,
    input: { sha256, bytes, row_count: rowCount },
    created_at: createdAt ?? new Date().toISOString(),
  });
}

export function validateManifest(manifest, { knownProfileNames = null } = {}) {
  const errors = [];
  if (!manifest || typeof manifest !== "object") {
    return { ok: false, errors: ["manifest must be an object"] };
  }
  if (manifest.version !== MANIFEST_VERSION) {
    errors.push(`unsupported manifest version ${manifest.version}`);
  }
  if (typeof manifest.profile !== "string" || manifest.profile === "") {
    errors.push("manifest.profile must be a non-empty string");
  } else if (
    knownProfileNames &&
    !knownProfileNames.includes(manifest.profile)
  ) {
    errors.push(
      `manifest.profile "${manifest.profile}" is not a known profile`,
    );
  }
  const input = manifest.input ?? {};
  if (!/^[0-9a-f]{64}$/.test(input.sha256 ?? "")) {
    errors.push("manifest.input.sha256 must be a sha256 hex digest");
  }
  if (!Number.isInteger(input.bytes) || input.bytes < 0) {
    errors.push("manifest.input.bytes must be a non-negative integer");
  }
  if (!Number.isInteger(input.row_count) || input.row_count < 0) {
    errors.push("manifest.input.row_count must be a non-negative integer");
  }
  if (typeof manifest.created_at !== "string" || manifest.created_at === "") {
    errors.push("manifest.created_at must be a non-empty string");
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Verifies a concrete input fingerprint against a manifest. Used before
 * apply and on resume: the input file must be byte-identical to the one
 * the plan was built from.
 */
export function verifyManifestInput(manifest, { sha256, bytes, rowCount }) {
  const mismatches = [];
  if (manifest?.input?.sha256 !== sha256) {
    mismatches.push("sha256 differs from the manifest");
  }
  if (manifest?.input?.bytes !== bytes) {
    mismatches.push("byte length differs from the manifest");
  }
  if (manifest?.input?.row_count !== rowCount) {
    mismatches.push("row count differs from the manifest");
  }
  return { ok: mismatches.length === 0, mismatches };
}
