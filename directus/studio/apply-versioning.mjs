import { DirectusAdminClient, isMainModule } from "../schema/apply-schema.mjs";
import { versioningBlueprint } from "./versioning-blueprint.mjs";

// Idempotent applier for the Task 16 versioning blueprint. For every declared
// collection it compares `meta.versioning` with the desired flag and patches
// ONLY that meta key when it differs — at most one PATCH per collection, so at
// most 3 writes for the current blueprint. Collections missing from the
// instance are skipped (reported as an action) instead of failing, so the run
// stays safe against partial schemas and staged rollouts (R12A articles first,
// R12B pages/home_page later).

export async function applyVersioning(
  client,
  blueprint = versioningBlueprint,
  { dryRun = false } = {},
) {
  const actions = [];
  const rows = await client.request("/collections");
  const collectionsByName = new Map(rows.map((row) => [row.collection, row]));

  for (const [name, config] of Object.entries(blueprint.collections)) {
    const current = collectionsByName.get(name);
    if (!current) {
      actions.push(`skip missing collection ${name}`);
      continue;
    }
    if ((current.meta?.versioning ?? false) === config.versioning) continue;
    actions.push(
      `${config.versioning ? "enable" : "disable"} versioning ${name}`,
    );
    if (!dryRun) {
      await client.request(`/collections/${encodeURIComponent(name)}`, {
        method: "PATCH",
        body: JSON.stringify({ meta: { versioning: config.versioning } }),
      });
    }
  }

  return actions;
}

async function main() {
  // Dry-run is the default: the explicit --apply flag is required to write,
  // mirroring the migration scripts' safety convention.
  const apply = process.argv.includes("--apply");
  const client = await DirectusAdminClient.connectFromEnvironment();
  const actions = await applyVersioning(client, versioningBlueprint, {
    dryRun: !apply,
  });
  if (actions.length === 0) {
    console.log("Versioning is already up to date.");
    return;
  }
  console.log(`${apply ? "Applied" : "Planned"} ${actions.length} versioning actions:`);
  for (const action of actions) console.log(`- ${action}`);
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
