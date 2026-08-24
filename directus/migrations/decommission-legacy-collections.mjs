import path from "node:path";

import { DirectusAdminClient, isMainModule } from "../schema/apply-schema.mjs";
import {
  assertArtifactDirectory,
  assertSafeArtifact,
  writeArtifactsExclusive,
} from "../releases/lib/artifacts.mjs";

/**
 * The six empty legacy collections scheduled for decommission.
 * Deleting a collection is permitted ONLY when every precondition holds:
 * zero rows, zero incoming FK/Directus relations, zero flows/hooks/presets/
 * permissions referencing it. Otherwise the run STOPS and writes nothing.
 */
export const LEGACY_COLLECTIONS = [
  "hero_blocks",
  "advantages",
  "cta_blocks",
  "seo_text_blocks",
  "banners",
  "testimonials",
];

const argumentValue = (name, args = process.argv.slice(2)) => {
  const prefix = `--${name}=`;
  return args.find((value) => value.startsWith(prefix))?.slice(prefix.length);
};

const optionReferencesTarget = (options, target) => {
  if (!options) return false;
  if (options.collection === target) return true;
  for (const key of ["collections", "collection_many"]) {
    if (Array.isArray(options[key]) && options[key].includes(target)) return true;
  }
  if (Array.isArray(options.scope)) {
    for (const entry of options.scope) {
      if (typeof entry !== "string") continue;
      if (entry === target) return true;
      if (entry.split(".").includes(target)) return true;
    }
  }
  return false;
};

/**
 * Returns true when a Directus flow references the target collection in its
 * trigger options or in any operation options (create/update/delete/get data,
 * event trigger scope, etc.).
 */
export function referencesCollection(flow, target) {
  if (!flow || typeof flow !== "object") return false;
  if (optionReferencesTarget(flow.options, target)) return true;
  for (const operation of flow.operations ?? []) {
    if (optionReferencesTarget(operation?.options, target)) return true;
  }
  return false;
}

const queryAll = (client, endpoint) => client.request(`/${endpoint}?limit=-1`);

const rowCount = async (client, collection) => {
  const query = new URLSearchParams({ fields: "id", limit: "1" });
  const rows = await client.request(`/items/${collection}?${query.toString()}`);
  return Array.isArray(rows) ? rows.length : 0;
};

/**
 * Gathers every precondition the contract requires before a collection may be
 * deleted. Read-only: performs no writes.
 */
export async function collectPreconditions(
  client,
  { collections = LEGACY_COLLECTIONS } = {},
) {
  const relations = await queryAll(client, "relations");
  const flows = await queryAll(client, "flows");
  const presets = await queryAll(client, "presets");
  const permissions = await queryAll(client, "permissions");

  const perCollection = {};
  for (const name of collections) {
    const incomingRelations = relations.filter(
      (relation) =>
        relation.related_collection === name && relation.collection !== name,
    );
    const ownRelations = relations.filter(
      (relation) => relation.collection === name,
    );
    const referencingFlows = flows.filter((flow) =>
      referencesCollection(flow, name),
    );
    const referencingPresets = presets.filter(
      (preset) => preset?.collection === name,
    );
    const referencingPermissions = permissions.filter(
      (permission) => permission?.collection === name,
    );
    perCollection[name] = {
      rows: await rowCount(client, name),
      incomingRelations,
      ownRelations,
      flows: referencingFlows,
      presets: referencingPresets,
      permissions: referencingPermissions,
    };
  }

  return { collections, perCollection, relations, flows, presets, permissions };
}

/**
 * Pure evaluation of preconditions. Produces the STOP blockers plus the list of
 * collections that are safe to delete and the relations that will be dropped
 * with them (Directus cascades a collection's own M2O relations on delete).
 */
export function evaluatePreconditions(
  preconditions,
  { collections = LEGACY_COLLECTIONS } = {},
) {
  const blockers = [];
  const deletable = [];
  const cascadeRelations = [];

  for (const name of collections) {
    const state = preconditions.perCollection[name] ?? {};
    const collectionBlockers = [];

    if ((state.rows ?? 0) > 0) {
      collectionBlockers.push({
        code: "non-empty-collection",
        collection: name,
        detail: `${state.rows}+ row(s) still present`,
      });
    }
    for (const relation of state.incomingRelations ?? []) {
      collectionBlockers.push({
        code: "incoming-relation",
        collection: name,
        detail: `${relation.collection}.${relation.field} -> ${name}`,
      });
    }
    for (const flow of state.flows ?? []) {
      collectionBlockers.push({
        code: "flow-reference",
        collection: name,
        detail: `flow ${flow.id ?? flow.name ?? "unknown"} references ${name}`,
      });
    }
    for (const preset of state.presets ?? []) {
      collectionBlockers.push({
        code: "preset-reference",
        collection: name,
        detail: `preset ${preset.id ?? "unknown"} targets ${name}`,
      });
    }
    for (const permission of state.permissions ?? []) {
      collectionBlockers.push({
        code: "permission-reference",
        collection: name,
        detail: `permission ${permission.id ?? "unknown"} (${permission.action ?? "?"}) on ${name}`,
      });
    }

    blockers.push(...collectionBlockers);

    if (collectionBlockers.length === 0) {
      deletable.push(name);
      for (const relation of state.ownRelations ?? []) {
        cascadeRelations.push({
          collection: name,
          relation: `${relation.collection}.${relation.field} -> ${relation.related_collection}`,
        });
      }
    }
  }

  return { ok: blockers.length === 0, blockers, deletable, cascadeRelations };
}

/**
 * Orchestrates the decommission. Default mode is a dry run (no writes).
 * `apply` requires a `releaseId`; a stopped result performs no writes even in
 * apply mode.
 */
export async function runDecommission(
  client,
  { collections = LEGACY_COLLECTIONS, apply = false, releaseId = null } = {},
) {
  if (apply && !releaseId) {
    throw new Error("--apply requires --release-id=<id>");
  }

  const preconditions = await collectPreconditions(client, { collections });
  const evaluation = evaluatePreconditions(preconditions, { collections });

  if (!evaluation.ok) {
    return {
      ok: false,
      stopped: true,
      applied: false,
      releaseId,
      blockers: evaluation.blockers,
      deletable: [],
      report: [],
      summary: {
        targetCount: collections.length,
        deletableCount: 0,
        blockerCount: evaluation.blockers.length,
        cascadeRelationCount: 0,
      },
    };
  }

  const report = [];
  for (const name of evaluation.deletable) {
    report.push({
      action: "delete collection",
      collection: name,
      releaseId: apply ? releaseId : null,
    });
    if (apply) {
      await client.request(`/collections/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
    }
  }
  for (const cascade of evaluation.cascadeRelations) {
    report.push({ action: "cascade-drop relation", ...cascade });
  }

  return {
    ok: true,
    stopped: false,
    applied: apply,
    releaseId,
    blockers: [],
    deletable: evaluation.deletable,
    report,
    summary: {
      targetCount: collections.length,
      deletableCount: evaluation.deletable.length,
      blockerCount: 0,
      cascadeRelationCount: evaluation.cascadeRelations.length,
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const releaseId = argumentValue("release-id", args) ?? null;
  const outputDirectory = argumentValue("output", args) ?? null;
  const dryRun = !apply;

  const client = await DirectusAdminClient.connectFromEnvironment();
  const result = await runDecommission(client, { apply, releaseId });

  if (outputDirectory) {
    const repositoryRoot = path.resolve(import.meta.dirname, "../..");
    const directory = await assertArtifactDirectory(outputDirectory, {
      repositoryRoot,
      scanExistingFiles: true,
    });
    const artifact = assertSafeArtifact({
      decommission: "legacy-collections",
      mode: dryRun ? "dry-run" : "apply",
      releaseId,
      ...result,
    });
    await writeArtifactsExclusive(directory, { "decommission-plan.json": artifact });
    console.log(`Wrote decommission plan to ${path.join(directory, "decommission-plan.json")}`);
  }

  if (result.stopped) {
    console.error(
      `STOP: ${result.summary.blockerCount} blocker(s) prevented decommission of the legacy collections:`,
    );
    for (const blocker of result.blockers) {
      console.error(`- [${blocker.code}] ${blocker.collection}: ${blocker.detail}`);
    }
    process.exitCode = 1;
    return;
  }

  const verb = apply ? "Applied" : "Planned";
  console.log(
    `${verb} decommission of ${result.summary.deletableCount}/${result.summary.targetCount} legacy collections ` +
      `(cascade-dropping ${result.summary.cascadeRelationCount} relations):`,
  );
  for (const entry of result.report) {
    const label = entry.collection ?? entry.relation;
    console.log(`- ${entry.action} ${label}`);
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
