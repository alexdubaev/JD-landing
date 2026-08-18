import path from "node:path";

import {
  DirectusAdminClient,
  buildCollectionPayload,
  buildFieldPayload,
  buildRelationPayload,
  isMainModule,
} from "../schema/apply-schema.mjs";
import { schemaBlueprint } from "../schema/blueprint.mjs";
import {
  assertArtifactDirectory,
  assertSafeArtifact,
  writeArtifactsExclusive,
} from "../releases/lib/artifacts.mjs";

/**
 * Additive `seo_work_items` control-plane schema (R10A, Task 14):
 *
 * - one collection, exactly the architecture-spec fields, sourced from the
 *   schema blueprint (single source of truth — this migration never restates
 *   field definitions);
 * - `article` is a nullable junction-side-only M2O to `articles`
 *   (meta.one_field stays null, so no O2M alias is ever posted — production
 *   R7 lesson);
 * - `status` lifecycle (draft → ready → review → applied / rolled_back /
 *   rejected) is Directus choices, NOT a SQL enum;
 * - `dedupe_key` is declared indexed here; the PHYSICAL UNIQUE constraint is
 *   owned by migrations/sql/seo-work-items-constraints-up.sql (operator-run,
 *   product_codes/products_analogs precedent).
 *
 * Modes:
 * - default (--dry-run): read-only plan; STOP before any write when a
 *   precondition fails. A fully applied state reports as a clean no-op.
 * - --apply --release-id=<id>: collection (primary key only) first, then the
 *   remaining fields in spec order, then the article relation. Schema/meta
 *   only — no item data is written.
 *
 * Resumable: existing pieces (collection, individual fields, relation) are
 * skipped, only the missing ones are created (production R7 lesson).
 */

export const SEO_WORK_ITEMS_COLLECTION = "seo_work_items";
export const SEO_WORK_ITEMS_RELATION_FIELD = "article";
export const SEO_WORK_ITEMS_RELATED_COLLECTION = "articles";

export const REQUIRED_COLLECTIONS = [SEO_WORK_ITEMS_RELATED_COLLECTION];

export const COLLECTION_BUDGET_LIMIT = 25;

export const STATUS_CHOICES = [
  "draft",
  "ready",
  "review",
  "applied",
  "rolled_back",
  "rejected",
];

const isSystemCollection = (name) => String(name).startsWith("directus_");

/**
 * The blueprint definition of seo_work_items — the migration and the schema
 * apply stay in lockstep by construction.
 */
export function getSeoWorkItemsCollection() {
  const collection = schemaBlueprint.collections.find(
    ({ name }) => name === SEO_WORK_ITEMS_COLLECTION,
  );
  if (!collection) {
    throw new Error(
      `${SEO_WORK_ITEMS_COLLECTION} is missing from the schema blueprint`,
    );
  }
  return collection;
}

export function seoWorkItemsFieldNames() {
  return getSeoWorkItemsCollection().fields.map(({ name }) => name);
}

/** Non-primary field payloads, in spec order. */
export function buildSeoWorkItemsFieldPayloads() {
  return getSeoWorkItemsCollection()
    .fields.filter((field) => !field.primary)
    .map((field) => buildFieldPayload(field));
}

/** Primary-key-only collection payload (fields follow as individual posts). */
export function buildSeoWorkItemsCollectionPayload() {
  return buildCollectionPayload(getSeoWorkItemsCollection());
}

/**
 * The single relation of the release: the junction-side M2O
 * seo_work_items.article -> articles. meta.one_field stays null, so Directus
 * never generates an alias side (production R7 lesson).
 */
export function buildArticleRelationPayload() {
  const field = getSeoWorkItemsCollection().fields.find(
    ({ name }) => name === SEO_WORK_ITEMS_RELATION_FIELD,
  );
  return buildRelationPayload(SEO_WORK_ITEMS_COLLECTION, field);
}

export const SEO_WORK_ITEMS_RELATION_KEY = `${SEO_WORK_ITEMS_COLLECTION}.${SEO_WORK_ITEMS_RELATION_FIELD}`;

/**
 * Reads the current schema state needed by the preconditions. Read-only.
 */
export async function collectSeoWorkItemsState(client) {
  const collections = await client.request("/collections");
  const collectionNames = new Set(
    collections.map(({ collection }) => collection),
  );
  const collectionExists = collectionNames.has(SEO_WORK_ITEMS_COLLECTION);
  const fields = collectionExists
    ? await client.request(`/fields/${SEO_WORK_ITEMS_COLLECTION}`)
    : [];
  const relations = await client.request(
    "/relations?limit=-1&fields=collection,field",
  );
  const relationKeys = new Set(
    (relations ?? []).map(({ collection, field }) => `${collection}.${field}`),
  );

  return {
    collections,
    collectionNames,
    dataCollectionCount: collections.filter(
      ({ collection, meta }) => !isSystemCollection(collection) && !meta?.folder,
    ).length,
    collectionExists,
    fieldNames: new Set((fields ?? []).map(({ field }) => field)),
    articleRelationExists: relationKeys.has(SEO_WORK_ITEMS_RELATION_KEY),
  };
}

/**
 * Pure evaluation of the STOP preconditions, the idempotency no-op and the
 * resume plan.
 */
export function evaluateSeoWorkItemsState(state) {
  const blockers = [];
  for (const required of REQUIRED_COLLECTIONS) {
    if (!state.collectionNames.has(required)) {
      blockers.push({
        code: "missing-collection",
        detail: `required collection ${required} not found`,
      });
    }
  }

  if (
    !state.collectionExists &&
    state.dataCollectionCount + 1 > COLLECTION_BUDGET_LIMIT
  ) {
    blockers.push({
      code: "collection-budget",
      detail: `adding ${SEO_WORK_ITEMS_COLLECTION} would reach ${state.dataCollectionCount + 1} data collections, over the limit of ${COLLECTION_BUDGET_LIMIT}`,
    });
  }

  const missingFields = seoWorkItemsFieldNames().filter(
    (name) => name !== "id" && !state.fieldNames.has(name),
  );
  const fullyApplied =
    state.collectionExists &&
    missingFields.length === 0 &&
    state.articleRelationExists;

  return {
    ok: blockers.length === 0,
    blockers,
    fullyApplied,
    collectionExists: state.collectionExists,
    articleRelationExists: state.articleRelationExists,
    missingFields,
    projectedCollectionCount: state.collectionExists
      ? state.dataCollectionCount
      : state.dataCollectionCount + 1,
  };
}

export const EXPECTED_AFTER = {
  dataCollectionCount: 23,
  workItemsCreated: 0,
  articlesChanged: 0,
};

/**
 * Orchestrates the additive control-plane schema. Default mode is a dry run
 * (no writes). `apply` requires a `releaseId`; a stopped or no-op result
 * performs no writes even in apply mode.
 */
export async function runSeoWorkItemsSetup(
  client,
  { apply = false, releaseId = null } = {},
) {
  if (apply && !releaseId) {
    throw new Error("--apply requires --release-id=<id>");
  }

  const state = await collectSeoWorkItemsState(client);
  const evaluation = evaluateSeoWorkItemsState(state);

  if (!evaluation.ok) {
    return {
      ok: false,
      stopped: true,
      applied: false,
      noop: false,
      releaseId,
      migration: "setup-seo-work-items",
      blockers: evaluation.blockers,
      report: [],
      summary: {
        dataCollectionCount: state.dataCollectionCount,
        projectedCollectionCount: evaluation.projectedCollectionCount,
      },
      expectedAfter: EXPECTED_AFTER,
    };
  }

  if (evaluation.fullyApplied) {
    return {
      ok: true,
      stopped: false,
      applied: false,
      noop: true,
      releaseId,
      migration: "setup-seo-work-items",
      blockers: [],
      report: [
        { action: "verify collection", target: SEO_WORK_ITEMS_COLLECTION },
        {
          action: "verify relation",
          relation: `${SEO_WORK_ITEMS_RELATION_KEY} -> ${SEO_WORK_ITEMS_RELATED_COLLECTION}`,
        },
      ],
      summary: {
        dataCollectionCount: state.dataCollectionCount,
        projectedCollectionCount: state.dataCollectionCount,
      },
      expectedAfter: EXPECTED_AFTER,
    };
  }

  const collectionPayload = buildSeoWorkItemsCollectionPayload();
  const fieldPayloads = buildSeoWorkItemsFieldPayloads();
  const relationPayload = buildArticleRelationPayload();

  const report = [];
  // RESUME-AWARE: existing pieces (e.g. after a failed apply) are skipped,
  // only the missing ones are created. ORDER MATTERS for fresh runs:
  // collection (primary key) first, then the fields in spec order, then the
  // article relation (its column must exist first). Schema/meta only — no
  // item data. Every write is awaited.
  const createOrSkip = async (exists, entry, createWrite) => {
    if (exists) {
      report.push({ action: `skip existing ${entry.action.replace(/^create /, "")}`, ...entry.rest });
      return;
    }
    if (apply) {
      await createWrite();
    }
    report.push(apply ? { ...entry, ...entry.rest, releaseId } : entry);
  };

  await createOrSkip(
    evaluation.collectionExists,
    {
      action: "create collection",
      rest: { collection: SEO_WORK_ITEMS_COLLECTION },
    },
    async () => {
      await client.request("/collections", {
        method: "POST",
        body: JSON.stringify(collectionPayload),
      });
    },
  );

  const existing = new Set(
    seoWorkItemsFieldNames().filter((name) => !evaluation.missingFields.includes(name)),
  );
  for (const payload of fieldPayloads) {
    await createOrSkip(
      existing.has(payload.field),
      {
        action: "create field",
        rest: { field: `${SEO_WORK_ITEMS_COLLECTION}.${payload.field}` },
      },
      async () => {
        await client.request(`/fields/${SEO_WORK_ITEMS_COLLECTION}`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      },
    );
  }

  await createOrSkip(
    evaluation.articleRelationExists,
    {
      action: "create relation",
      rest: {
        relation: `${SEO_WORK_ITEMS_RELATION_KEY} -> ${SEO_WORK_ITEMS_RELATED_COLLECTION}`,
      },
    },
    async () => {
      await client.request("/relations", {
        method: "POST",
        body: JSON.stringify(relationPayload),
      });
    },
  );

  return {
    ok: true,
    stopped: false,
    applied: apply,
    noop: false,
    releaseId,
    migration: "setup-seo-work-items",
    blockers: [],
    report,
    summary: {
      dataCollectionCount: state.dataCollectionCount,
      projectedCollectionCount: evaluation.projectedCollectionCount,
    },
    expectedAfter: EXPECTED_AFTER,
  };
}

const argumentValue = (name, args = process.argv.slice(2)) => {
  const prefix = `--${name}=`;
  return args.find((value) => value.startsWith(prefix))?.slice(prefix.length);
};

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const releaseId = argumentValue("release-id", args) ?? null;
  const outputDirectory = argumentValue("output", args) ?? null;
  const dryRun = !apply;

  const client = await DirectusAdminClient.connectFromEnvironment();
  const result = await runSeoWorkItemsSetup(client, { apply, releaseId });

  if (outputDirectory) {
    const repositoryRoot = path.resolve(import.meta.dirname, "../..");
    const directory = await assertArtifactDirectory(outputDirectory, {
      repositoryRoot,
      scanExistingFiles: true,
    });
    const artifact = assertSafeArtifact({
      migration: "setup-seo-work-items",
      mode: dryRun ? "dry-run" : "apply",
      releaseId,
      ...result,
    });
    await writeArtifactsExclusive(directory, { "seo-work-items-plan.json": artifact });
    console.log(`Wrote seo work items plan to ${path.join(directory, "seo-work-items-plan.json")}`);
  }

  if (result.stopped) {
    console.error(
      `STOP: ${result.blockers.length} blocker(s) prevented the seo work items setup:`,
    );
    for (const blocker of result.blockers) {
      console.error(`- [${blocker.code}] ${blocker.detail}`);
    }
    process.exitCode = 1;
    return;
  }

  if (result.noop) {
    console.log("seo_work_items schema is already applied — nothing to do.");
    return;
  }

  const verb = apply ? "Applied" : "Planned";
  console.log(
    `${verb} the additive seo_work_items control-plane schema ` +
      `(${result.summary.projectedCollectionCount} data collections after apply; ` +
      `run migrations/sql/seo-work-items-constraints-up.sql for the UNIQUE dedupe_key in the same window):`,
  );
  for (const entry of result.report) {
    const label = entry.collection ?? entry.field ?? entry.relation;
    console.log(`- ${entry.action} ${label}`);
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
