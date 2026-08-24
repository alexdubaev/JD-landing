// Task 13 (R9): CLI entrypoint for the field-level catalog importer.
//
//   node importer/cli.mjs --profile=operations-default --input=price-list.ndjson
//   node importer/cli.mjs --profile=operations-default --input=... \
//     --apply --release-id=R9-2026-08-20 --output=D:\jd-release-packets\R9-imp
//   node importer/cli.mjs --rollback --output=D:\jd-release-packets\R9-imp \
//     --release-id=R9-2026-08-20 [--apply]
//
// Safety defaults:
// - DRY RUN unless --apply is passed; --dry-run exists for explicitness.
// - --apply additionally requires --release-id AND --output/JD_RELEASE_DIR
//   (the before-state and append-only report must land in a closed
//   directory outside the repository).
// - Opt-in profiles refuse without --approval-ref=<string> BEFORE any
//   client connection is created.
// - --resume=<n> continues an interrupted batch at the exact record offset
//   reported by the interruption error.

import path from "node:path";
import { readFile } from "node:fs/promises";

import { DirectusAdminClient, isMainModule } from "../schema/apply-schema.mjs";
import {
  PROFILE_NAMES,
  evaluateProfileApproval,
  getProfile,
} from "./profiles.mjs";
import { normalizeRow } from "./normalize.mjs";
import {
  BEFORE_STATE_ARTIFACT_NAME,
  MANIFEST_ARTIFACT_NAME,
  REPORT_ARTIFACT_NAME,
  buildInputManifest,
  findDuplicateSkuKeys,
  readInputFile,
  readNdjsonFile,
} from "./manifest.mjs";
import { runImportApply } from "./apply.mjs";
import { reconcileCatalogImport } from "./reconcile.mjs";
import { rollbackCatalogImport } from "./rollback.mjs";

export const USAGE = `Usage: node importer/cli.mjs [options]

Options:
  --profile=<name>        Import profile (${PROFILE_NAMES.join(", ")})
  --input=<path>          NDJSON input file (one product row per line)
  --apply                 Actually write (default is a read-only dry run)
  --dry-run               Explicit dry run (default)
  --release-id=<id>       Release id (required with --apply)
  --output=<dir>          Release artifact directory, also JD_RELEASE_DIR
                          (required with --apply; must be outside the repo)
  --approval-ref=<string> Approval reference (required for opt-in profiles)
  --resume=<n>            Resume an interrupted batch at record offset n
  --rollback              Roll a release directory back to its before-state
  --list-profiles         Print profile descriptions
  --help                  This help`;

const VALUE_FLAGS = new Set([
  "profile",
  "input",
  "release-id",
  "output",
  "approval-ref",
  "resume",
]);
const BOOLEAN_FLAGS = new Set([
  "apply",
  "dry-run",
  "rollback",
  "help",
  "list-profiles",
]);

export function parseCliArguments(argv) {
  const args = {
    profile: null,
    input: null,
    apply: false,
    dryRun: false,
    releaseId: null,
    output: null,
    approvalRef: null,
    resume: 0,
    rollback: false,
    help: false,
    listProfiles: false,
  };
  const errors = [];

  for (const token of argv) {
    if (token === "--help") {
      args.help = true;
      continue;
    }
    if (!token.startsWith("--")) {
      errors.push(`unexpected argument "${token}"`);
      continue;
    }
    const equalsIndex = token.indexOf("=");
    const name = equalsIndex === -1 ? token.slice(2) : token.slice(2, equalsIndex);
    const value = equalsIndex === -1 ? null : token.slice(equalsIndex + 1);

    if (BOOLEAN_FLAGS.has(name) && equalsIndex === -1) {
      if (name === "apply") args.apply = true;
      if (name === "dry-run") args.dryRun = true;
      if (name === "rollback") args.rollback = true;
      if (name === "list-profiles") args.listProfiles = true;
      continue;
    }
    if (VALUE_FLAGS.has(name) && equalsIndex !== -1) {
      if (name === "profile") args.profile = value;
      if (name === "input") args.input = value;
      if (name === "release-id") args.releaseId = value;
      if (name === "output") args.output = value;
      if (name === "approval-ref") args.approvalRef = value;
      if (name === "resume") args.resume = value;
      continue;
    }
    errors.push(`unknown or malformed flag "${token}"`);
  }

  if (args.resume !== 0) {
    const parsed = Number(args.resume);
    if (!Number.isInteger(parsed) || parsed < 0) {
      errors.push("--resume must be a non-negative integer");
    } else {
      args.resume = parsed;
    }
  }
  if (args.apply && args.dryRun) {
    errors.push("--apply and --dry-run are mutually exclusive");
  }
  if (args.releaseId != null &&
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(args.releaseId)) {
    errors.push("--release-id must contain only letters, digits, dots, dashes, underscores");
  }
  return { args, errors };
}

const fail = (message, exitCode = 2) => ({ ok: false, exitCode, message });

export async function runImporterCli({
  argv = process.argv.slice(2),
  env = process.env,
  clientFactory = () => DirectusAdminClient.connectFromEnvironment(),
  now = () => new Date().toISOString(),
  log = console.log,
} = {}) {
  const { args, errors } = parseCliArguments(argv);
  if (errors.length > 0) return fail(errors.join("; "));
  if (args.help) {
    log(USAGE);
    return { ok: true, exitCode: 0, mode: "help" };
  }
  if (args.listProfiles) {
    for (const name of PROFILE_NAMES) {
      const profile = getProfile(name);
      log(`- ${name}${profile.optIn ? " (opt-in, requires --approval-ref)" : ""}: ${profile.description}`);
    }
    return { ok: true, exitCode: 0, mode: "list-profiles" };
  }

  const outputDirectory = args.output ?? env.JD_RELEASE_DIR ?? null;

  if (args.rollback) {
    if (!args.releaseId) return fail("--rollback requires --release-id=<id>");
    if (!outputDirectory) {
      return fail("--rollback requires --output=<dir> or JD_RELEASE_DIR");
    }
    let manifest;
    try {
      manifest = JSON.parse(
        await readFile(path.join(outputDirectory, MANIFEST_ARTIFACT_NAME), "utf8"),
      );
    } catch {
      return fail(`cannot read ${MANIFEST_ARTIFACT_NAME} from ${outputDirectory}`);
    }
    const profile = getProfile(manifest.profile);
    if (args.profile && args.profile !== manifest.profile) {
      return fail(
        `--profile=${args.profile} does not match the release manifest profile "${manifest.profile}"`,
      );
    }
    const beforeState = (
      await readNdjsonFile(path.join(outputDirectory, BEFORE_STATE_ARTIFACT_NAME))
    ).rows;
    const reportEntries = (
      await readNdjsonFile(path.join(outputDirectory, REPORT_ARTIFACT_NAME))
    ).rows;

    const client = await clientFactory();
    const result = await rollbackCatalogImport(client, {
      profile,
      beforeState,
      reportEntries,
      apply: args.apply,
      releaseId: args.releaseId,
      now,
    });

    if (result.stopped) {
      log(`ROLLBACK STOPPED (${result.blockers.length} blocker(s)):`);
      for (const blocker of result.blockers) log(`- [${blocker.code}] ${blocker.detail}`);
      return { ok: false, exitCode: 1, mode: "rollback", result };
    }
    const s = result.summary;
    log(
      `${args.apply ? "Rolled back" : "Rollback plan for"} release ${args.releaseId}: ` +
        `${s.restore_patches} restore patch(es), ${s.products_deleted} created product(s) to delete, ` +
        `${s.edges_deleted} edge(s) to delete (${s.verified} before-state row(s) verified).`,
    );
    if (!result.ok) {
      for (const violation of result.violations) {
        log(`- [${violation.code}] ${violation.detail}`);
      }
      return { ok: false, exitCode: 1, mode: "rollback", result };
    }
    return { ok: true, exitCode: 0, mode: "rollback", result };
  }

  // Import mode.
  if (!args.profile) return fail("--profile=<name> is required");
  if (!args.input) return fail("--input=<path> is required");

  const profile = getProfile(args.profile);

  // Approval guard BEFORE the client is ever created.
  const approval = evaluateProfileApproval(profile, args.approvalRef);
  if (!approval.ok) return fail(approval.detail);

  if (args.apply && !args.releaseId) return fail("--apply requires --release-id=<id>");
  if (args.apply && !outputDirectory) {
    return fail("--apply requires --output=<dir> or JD_RELEASE_DIR (before-state and report artifacts)");
  }

  const input = await readInputFile(args.input);
  if (input.errors.length > 0) {
    return fail(
      `input has unparseable lines: ${input.errors
        .map(({ line }) => `line ${line}`)
        .join(", ")}`,
    );
  }
  const duplicateSkuKeys = findDuplicateSkuKeys(input.rows);
  if (duplicateSkuKeys.length > 0) {
    return fail(`input contains duplicate SKU keys: ${duplicateSkuKeys.length} key(s)`);
  }

  const manifest = buildInputManifest({
    profileName: profile.name,
    sha256: input.sha256,
    bytes: input.bytes,
    rowCount: input.rowCount,
    createdAt: now(),
  });
  const normalizedRows = input.rows.map((row, index) => normalizeRow(row, index));

  const client = await clientFactory();
  const result = await runImportApply(client, {
    profile,
    manifest,
    normalizedRows,
    apply: args.apply,
    releaseId: args.releaseId,
    approvalRef: args.approvalRef,
    resumeOffset: args.resume,
    outputDirectory,
    now,
  });

  if (result.stopped) {
    log(`STOP: ${result.blockers.length} blocker(s) prevented the import:`);
    for (const blocker of result.blockers) log(`- [${blocker.code}] ${blocker.detail}`);
    return { ok: false, exitCode: 1, mode: "import", result };
  }

  const s = result.summary;
  log(
    `${args.apply ? "Applied" : "Planned"} catalog import (${profile.name}): ` +
      `${s.rows.total} row(s) — ${s.rows.create} create-draft, ${s.rows.patch} patch, ` +
      `${s.rows.skip} skip, ${s.rows.conflict} conflict, ${s.rows.edgesPlanned} edge(s).`,
  );
  if (result.noop) {
    log("Nothing to write — the catalog already matches this input (idempotent no-op).");
  }

  let reconcile = null;
  if (args.apply) {
    reconcile = await reconcileCatalogImport(client, {
      profile,
      normalizedRows,
      beforeState: result.beforeState,
      reportEntries: result.reportEntries,
    });
    if (reconcile.ok) {
      log("Reconciliation OK: all rows re-plan as skip/conflict, drafts confirmed, protected fields unchanged.");
    } else {
      log(`Reconciliation FAILED with ${reconcile.violations.length} violation(s):`);
      for (const violation of reconcile.violations) {
        log(`- [${violation.code}] ${violation.detail}`);
      }
      return { ok: false, exitCode: 1, mode: "import", result, reconcile };
    }
  }

  return { ok: true, exitCode: 0, mode: "import", result, reconcile };
}

if (isMainModule(import.meta.url, process.argv[1])) {
  runImporterCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
