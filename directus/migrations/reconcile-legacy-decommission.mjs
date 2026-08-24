import { readFile } from "node:fs/promises";

import { LEGACY_COLLECTIONS } from "./decommission-legacy-collections.mjs";
import { isMainModule } from "../schema/apply-schema.mjs";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const physicalCollectionNames = (baseline) => {
  const rows = baseline?.details?.schema?.collections ?? [];
  return new Set(
    rows
      .filter(
        (entry) =>
          entry?.schema?.name &&
          !String(entry.collection).startsWith("directus_"),
      )
      .map((entry) => entry.collection),
  );
};

/**
 * Verifies the post-state of the legacy-collections decommission against the
 * before baseline produced by `releases/capture-baseline.mjs`. Pure function:
 * takes two baseline objects and returns a structured reconciliation result.
 *
 * Contract: exactly the six legacy collections were removed, the physical
 * collection count dropped to 19, no new broken relations appeared, kept
 * collection row hashes are unchanged, and no relation in the after-state
 * still references a decommissioned collection.
 */
export function reconcileLegacyDecommission(
  before,
  after,
  {
    removedCollections = LEGACY_COLLECTIONS,
    expectedPhysicalCollections = 19,
  } = {},
) {
  const failures = [];
  const summary = {};

  const beforeNames = physicalCollectionNames(before);
  const afterNames = physicalCollectionNames(after);
  const expectedRemoved = new Set(removedCollections);

  const removed = [...beforeNames]
    .filter((name) => !afterNames.has(name))
    .sort();
  const added = [...afterNames]
    .filter((name) => !beforeNames.has(name))
    .sort();
  summary.removed = removed;
  summary.added = added;

  for (const name of removedCollections) {
    if (!beforeNames.has(name)) {
      failures.push({ code: "target-missing-before", collection: name });
    }
  }

  const removedMatch =
    removed.length === removedCollections.length &&
    removedCollections.every((name) => removed.includes(name));
  if (!removedMatch) {
    failures.push({
      code: "unexpected-removal-set",
      removed,
      expected: [...removedCollections].sort(),
    });
  }
  if (added.length > 0) {
    failures.push({ code: "unexpected-added-collections", added });
  }

  const beforeCount = Number(before?.counts?.collectionCount);
  const afterCount = Number(after?.counts?.collectionCount);
  summary.collectionCountBefore = beforeCount;
  summary.collectionCountAfter = afterCount;
  if (Number.isFinite(beforeCount) && Number.isFinite(afterCount)) {
    if (afterCount !== beforeCount - removedCollections.length) {
      failures.push({
        code: "collection-count-delta",
        before: beforeCount,
        after: afterCount,
        expectedDelta: removedCollections.length,
      });
    }
    if (afterCount !== expectedPhysicalCollections) {
      failures.push({
        code: "physical-collection-count",
        expected: expectedPhysicalCollections,
        actual: afterCount,
      });
    }
  } else {
    failures.push({ code: "missing-collection-count" });
  }

  const beforeBroken = Number(before?.integrity?.brokenRelations ?? 0);
  const afterBroken = Number(after?.integrity?.brokenRelations ?? 0);
  summary.brokenRelationsBefore = beforeBroken;
  summary.brokenRelationsAfter = afterBroken;
  if (afterBroken > beforeBroken) {
    failures.push({
      code: "new-broken-relation",
      before: beforeBroken,
      after: afterBroken,
    });
  }

  for (const [hashKey, beforeHash] of Object.entries(before?.hashes ?? {})) {
    const afterHash = after?.hashes?.[hashKey];
    if (afterHash === undefined) {
      failures.push({ code: "missing-hash", hash: hashKey });
    } else if (SHA256_PATTERN.test(String(beforeHash)) && beforeHash !== afterHash) {
      failures.push({ code: "kept-collection-changed", hash: hashKey });
    }
  }

  for (const relation of after?.details?.relations ?? []) {
    for (const side of [relation.collection, relation.related_collection]) {
      if (expectedRemoved.has(side)) {
        failures.push({
          code: "dangling-legacy-relation",
          relation: `${relation.collection}.${relation.field}`,
          side,
        });
      }
    }
  }

  return {
    ok: failures.length === 0,
    removedCollections,
    expectedPhysicalCollections,
    failures,
    summary,
  };
}

const argumentValue = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
};

const readJson = async (filename) =>
  JSON.parse(await readFile(filename, "utf8"));

async function main() {
  const beforeFile = argumentValue("baseline") ?? process.env.JD_BASELINE_BEFORE;
  const afterFile = argumentValue("actual") ?? process.env.JD_BASELINE_AFTER;
  if (!beforeFile || !afterFile) {
    throw new Error("Set --baseline/--actual or JD_BASELINE_BEFORE/JD_BASELINE_AFTER");
  }

  const result = reconcileLegacyDecommission(
    await readJson(beforeFile),
    await readJson(afterFile),
  );

  console.log(
    `Reconcile legacy decommission: ${result.ok ? "OK" : "FAILED"} ` +
      `(removed ${result.summary.removed.length}, added ${result.summary.added.length}, ` +
      `collections ${result.summary.collectionCountBefore} -> ${result.summary.collectionCountAfter}, ` +
      `broken relations ${result.summary.brokenRelationsBefore} -> ${result.summary.brokenRelationsAfter})`,
  );
  if (!result.ok) {
    for (const failure of result.failures) {
      console.error(`- [${failure.code}] ${JSON.stringify(failure)}`);
    }
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
