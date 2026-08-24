import path from "node:path";

import { DirectusAdminClient, isMainModule } from "../schema/apply-schema.mjs";
import {
  assertArtifactDirectory,
  assertSafeArtifact,
  writeArtifactsExclusive,
} from "../releases/lib/artifacts.mjs";

/**
 * Additive article editor schema (R5A), matching the S1 pilot acceptance
 * (docs/reports/directus-flexible-editor-1.9.0-pilot.md):
 *
 * - `articles_editor_nodes` junction collection (PK = Generated UUID), created
 *   FIRST — the extension README requires the junction to exist before the
 *   M2A alias.
 * - `articles.editor_nodes` hidden M2A alias (no interface, Hidden on Detail),
 *   Related Collections = products + categories, cascade on delete/deselect.
 * - `articles.content_blocks` nullable JSON field, interface `flexible-editor`
 *   with the M2A Reference Field and the Tools option (H1 disabled, H2-H4 /
 *   lists / quote / link / table enabled).
 *
 * `articles.content` (HTML) is NOT modified — it stays the canonical source
 * until the cutover release (Task 9). No fallback `article_cta_blocks`
 * collection is created (S1 = ACCEPT without fallback).
 *
 * Modes:
 * - default (--dry-run): read-only plan; STOP before any write when a
 *   precondition fails. A fully applied state reports as a clean no-op.
 * - --apply --release-id=<id>: junction collection first, then the alias
 *   field, then the four M2A relations (the Directus REST API requires the
 *   referenced fields to exist before /relations may reference them), then
 *   the content_blocks field. Schema/meta only — no item data is written.
 */

export const EDITOR_COLLECTION = "articles";
export const EDITOR_JUNCTION_COLLECTION = "articles_editor_nodes";
export const EDITOR_ALIAS_FIELD = "editor_nodes";
export const EDITOR_CONTENT_FIELD = "content_blocks";
export const EDITOR_INTERFACE_NAME = "flexible-editor";

export const EDITOR_RELATED_COLLECTIONS = ["products", "categories"];

export const COLLECTION_BUDGET_LIMIT = 25;

/**
 * Tool keys of the flexible editor interface (v1.9.0 bundle contract).
 * H1 is intentionally absent: one H1 per page lives outside the article body.
 */
export const EDITOR_TOOLS = [
  "paragraph",
  "h2",
  "h3",
  "h4",
  "bold",
  "italic",
  "strike",
  "underline",
  "code",
  "subscript",
  "superscript",
  "link",
  "removeLink",
  "autolink",
  "bulletList",
  "orderedList",
  "blockquote",
  "codeBlock",
  "table",
  "horizontalRule",
  "hardBreak",
  "textAlign",
  "undo",
  "redo",
];

export const EDITOR_FIELD_OPTIONS = {
  m2aField: EDITOR_ALIAS_FIELD,
  relationBlocks: [...EDITOR_RELATED_COLLECTIONS],
  relationInlineBlocks: [...EDITOR_RELATED_COLLECTIONS],
  relationMarks: [...EDITOR_RELATED_COLLECTIONS],
  tools: [...EDITOR_TOOLS],
};

export function buildJunctionCollectionPayload() {
  return {
    collection: EDITOR_JUNCTION_COLLECTION,
    meta: {
      icon: "account_tree",
      hidden: true,
      singleton: false,
      archive_field: null,
      archive_value: "archived",
      unarchive_value: "draft",
      archive_app_filter: false,
      sort_field: null,
      note: "M2A junction of the articles flexible editor. Managed by the editor, not by hand.",
    },
    schema: { name: EDITOR_JUNCTION_COLLECTION },
    fields: [
      {
        field: "id",
        type: "uuid",
        meta: {
          interface: null,
          special: ["uuid"],
          readonly: true,
          hidden: true,
          required: true,
          options: null,
          width: "full",
        },
        schema: {
          is_primary_key: true,
          is_nullable: false,
          is_unique: false,
          is_indexed: true,
          default_value: null,
          max_length: null,
          numeric_precision: null,
          numeric_scale: null,
        },
      },
      {
        field: "articles_id",
        type: "uuid",
        meta: {
          interface: null,
          special: ["m2o"],
          readonly: false,
          hidden: true,
          required: true,
          options: null,
          width: "full",
        },
        schema: {
          is_primary_key: false,
          is_nullable: false,
          is_unique: false,
          is_indexed: false,
          default_value: null,
          max_length: null,
          numeric_precision: null,
          numeric_scale: null,
        },
      },
      {
        field: "collection",
        type: "string",
        meta: {
          interface: null,
          special: ["m2a"],
          readonly: false,
          hidden: true,
          required: false,
          options: null,
          width: "full",
          note: "Polymorphic discriminator of the related collection.",
        },
        schema: {
          is_primary_key: false,
          is_nullable: true,
          is_unique: false,
          is_indexed: false,
          default_value: null,
          max_length: 255,
          numeric_precision: null,
          numeric_scale: null,
        },
      },
      {
        field: "item",
        type: "uuid",
        meta: {
          interface: null,
          special: ["m2o"],
          readonly: false,
          hidden: true,
          required: false,
          options: null,
          width: "full",
          note: "Polymorphic key of the related item.",
        },
        schema: {
          is_primary_key: false,
          is_nullable: true,
          is_unique: false,
          is_indexed: false,
          default_value: null,
          max_length: null,
          numeric_precision: null,
          numeric_scale: null,
        },
      },
    ],
  };
}

export function buildAliasFieldPayload() {
  return {
    field: EDITOR_ALIAS_FIELD,
    type: "alias",
    meta: {
      interface: null,
      special: ["m2a"],
      options: null,
      readonly: false,
      hidden: true,
      required: false,
      width: "full",
      note: "Hidden M2A alias managed by the flexible editor.",
    },
    schema: null,
  };
}

/**
 * The three M2A relations, in creation order. Every referenced field already
 * exists at this point (junction fields ship with the collection payload,
 * the alias field is posted before these relations).
 *
 * PRODUCTION R7 LESSON: do NOT post the alias-side relation
 * (articles.editor_nodes -> junction) separately — Directus generates a DB
 * foreign key for it and fails on the alias column that does not exist
 * ("column editor_nodes referenced in foreign key constraint does not
 * exist"). The alias side is auto-created by Directus when the junction-side
 * M2O carries meta.one_field (same pattern as apply-schema.mjs).
 */
export function buildEditorRelationPayloads() {
  return [
    {
      collection: EDITOR_JUNCTION_COLLECTION,
      field: "articles_id",
      related_collection: EDITOR_COLLECTION,
      meta: {
        special: ["m2o"],
        junction_field: null,
        one_field: EDITOR_ALIAS_FIELD,
        one_deselect_action: "delete",
      },
      schema: {
        on_delete: "CASCADE",
        on_update: "NO ACTION",
      },
    },
    {
      collection: EDITOR_JUNCTION_COLLECTION,
      field: "collection",
      related_collection: null,
      meta: {
        special: ["m2a"],
        junction_field: null,
        one_collection_field: "collection",
        one_allowed_collections: [...EDITOR_RELATED_COLLECTIONS],
        one_deselect_action: "delete",
        sort_field: null,
      },
      schema: null,
    },
    {
      collection: EDITOR_JUNCTION_COLLECTION,
      field: "item",
      related_collection: null,
      meta: {
        special: ["m2o"],
        junction_field: "collection",
      },
      schema: null,
    },
  ];
}

export function editorRelationKeys() {
  return buildEditorRelationPayloads().map(
    ({ collection, field }) => `${collection}.${field}`,
  );
}

export function buildContentBlocksFieldPayload() {
  return {
    field: EDITOR_CONTENT_FIELD,
    type: "json",
    meta: {
      interface: EDITOR_INTERFACE_NAME,
      special: ["cast-json"],
      options: EDITOR_FIELD_OPTIONS,
      readonly: false,
      hidden: false,
      required: false,
      width: "full",
      note: "Structured ProseMirror content. articles.content (HTML) stays canonical until cutover.",
    },
    schema: {
      is_primary_key: false,
      is_nullable: true,
      is_unique: false,
      is_indexed: false,
      default_value: null,
      max_length: null,
      numeric_precision: null,
      numeric_scale: null,
    },
  };
}

const isSystemCollection = (name) => String(name).startsWith("directus_");

/**
 * Reads the current schema state needed by the preconditions. Read-only.
 * Resumable: also collects which editor relations already exist.
 */
export async function collectEditorState(client) {
  const collections = await client.request("/collections");
  const articlesFields = await client.request(`/fields/${EDITOR_COLLECTION}`);
  const relations = await client.request(
    "/relations?limit=-1&fields=collection,field",
  );
  const relationKeys = new Set(
    (relations ?? []).map(({ collection, field }) => `${collection}.${field}`),
  );
  const wantedRelations = new Set(editorRelationKeys());
  return {
    collections,
    collectionNames: new Set(collections.map(({ collection }) => collection)),
    dataCollectionCount: collections.filter(
      ({ collection, meta }) => !isSystemCollection(collection) && !meta?.folder,
    ).length,
    articlesFieldNames: new Set(
      (articlesFields ?? []).map(({ field }) => field),
    ),
    existingRelations: wantedRelations,
    missingRelations: [...wantedRelations].filter((key) => !relationKeys.has(key)),
  };
}

/**
 * Pure evaluation of the STOP preconditions, the idempotency no-op and the
 * resume plan. PRODUCTION R7 LESSON: a partial apply (junction + alias field
 * created, relations/field pending after a failed relation payload) must be
 * RESUMABLE — existing pieces are skipped, only the missing ones are created.
 */
export function evaluateEditorState(state) {
  const blockers = [];
  const junctionExists = state.collectionNames.has(EDITOR_JUNCTION_COLLECTION);
  const aliasExists = state.articlesFieldNames.has(EDITOR_ALIAS_FIELD);
  const contentFieldExists = state.articlesFieldNames.has(EDITOR_CONTENT_FIELD);
  const relationsComplete = state.missingRelations.length === 0;
  const fullyApplied =
    junctionExists && aliasExists && contentFieldExists && relationsComplete;

  for (const required of [EDITOR_COLLECTION, ...EDITOR_RELATED_COLLECTIONS]) {
    if (!state.collectionNames.has(required)) {
      blockers.push({
        code: "missing-collection",
        detail: `required collection ${required} not found`,
      });
    }
  }

  if (!junctionExists && state.dataCollectionCount + 1 > COLLECTION_BUDGET_LIMIT) {
    blockers.push({
      code: "collection-budget",
      detail: `adding ${EDITOR_JUNCTION_COLLECTION} would reach ${state.dataCollectionCount + 1} data collections, over the limit of ${COLLECTION_BUDGET_LIMIT}`,
    });
  }

  return {
    ok: blockers.length === 0,
    blockers,
    fullyApplied,
    junctionExists,
    aliasExists,
    contentFieldExists,
    relationsComplete,
    missingRelations: state.missingRelations ?? [],
    projectedCollectionCount: junctionExists
      ? state.dataCollectionCount
      : state.dataCollectionCount + 1,
  };
}

export const EXPECTED_AFTER = {
  dataCollectionCount: 20,
  articlesChanged: 0,
  contentBlocksFilled: 0,
  junctionRows: 0,
};

/**
 * Orchestrates the additive editor schema. Default mode is a dry run (no
 * writes). `apply` requires a `releaseId`; a stopped or no-op result performs
 * no writes even in apply mode.
 */
export async function runArticleEditorSetup(
  client,
  { apply = false, releaseId = null } = {},
) {
  if (apply && !releaseId) {
    throw new Error("--apply requires --release-id=<id>");
  }

  const state = await collectEditorState(client);
  const evaluation = evaluateEditorState(state);

  if (!evaluation.ok) {
    return {
      ok: false,
      stopped: true,
      applied: false,
      noop: false,
      releaseId,
      migration: "setup-article-editor",
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
      migration: "setup-article-editor",
      blockers: [],
      report: [
        { action: "verify collection", target: EDITOR_JUNCTION_COLLECTION },
        { action: "verify field", field: `${EDITOR_COLLECTION}.${EDITOR_ALIAS_FIELD}` },
        { action: "verify field", field: `${EDITOR_COLLECTION}.${EDITOR_CONTENT_FIELD}` },
      ],
      summary: {
        dataCollectionCount: state.dataCollectionCount,
        projectedCollectionCount: state.dataCollectionCount,
      },
      expectedAfter: EXPECTED_AFTER,
    };
  }

  const junction = buildJunctionCollectionPayload();
  const aliasField = buildAliasFieldPayload();
  const relations = buildEditorRelationPayloads();
  const contentField = buildContentBlocksFieldPayload();

  const report = [];
  // RESUME-AWARE: existing pieces (e.g. after a failed apply) are skipped,
  // only the missing ones are created. ORDER MATTERS for fresh runs: junction
  // first (extension README), then the alias field, then the junction-side
  // relations (the alias side is auto-created via meta.one_field), then
  // content_blocks. Schema/meta only — no item data. Every write is awaited.
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
    evaluation.junctionExists,
    { action: "create collection", rest: { collection: EDITOR_JUNCTION_COLLECTION } },
    async () => {
      await client.request("/collections", {
        method: "POST",
        body: JSON.stringify(junction),
      });
    },
  );

  await createOrSkip(
    evaluation.aliasExists,
    { action: "create field", rest: { field: `${EDITOR_COLLECTION}.${EDITOR_ALIAS_FIELD}` } },
    async () => {
      await client.request(`/fields/${EDITOR_COLLECTION}`, {
        method: "POST",
        body: JSON.stringify(aliasField),
      });
    },
  );

  const missing = new Set(evaluation.missingRelations ?? []);
  for (const relation of relations) {
    const key = `${relation.collection}.${relation.field}`;
    await createOrSkip(
      !missing.has(key),
      {
        action: "create relation",
        rest: {
          relation: relation.related_collection
            ? `${relation.collection}.${relation.field} -> ${relation.related_collection}`
            : `${relation.collection}.${relation.field} -> (polymorphic)`,
        },
      },
      async () => {
        await client.request("/relations", {
          method: "POST",
          body: JSON.stringify(relation),
        });
      },
    );
  }

  await createOrSkip(
    evaluation.contentFieldExists,
    { action: "create field", rest: { field: `${EDITOR_COLLECTION}.${EDITOR_CONTENT_FIELD}` } },
    async () => {
      await client.request(`/fields/${EDITOR_COLLECTION}`, {
        method: "POST",
        body: JSON.stringify(contentField),
      });
    },
  );

  return {
    ok: true,
    stopped: false,
    applied: apply,
    noop: false,
    releaseId,
    migration: "setup-article-editor",
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
  const result = await runArticleEditorSetup(client, { apply, releaseId });

  if (outputDirectory) {
    const repositoryRoot = path.resolve(import.meta.dirname, "../..");
    const directory = await assertArtifactDirectory(outputDirectory, {
      repositoryRoot,
      scanExistingFiles: true,
    });
    const artifact = assertSafeArtifact({
      migration: "setup-article-editor",
      mode: dryRun ? "dry-run" : "apply",
      releaseId,
      ...result,
    });
    await writeArtifactsExclusive(directory, { "article-editor-plan.json": artifact });
    console.log(`Wrote article editor plan to ${path.join(directory, "article-editor-plan.json")}`);
  }

  if (result.stopped) {
    console.error(
      `STOP: ${result.blockers.length} blocker(s) prevented the article editor setup:`,
    );
    for (const blocker of result.blockers) {
      console.error(`- [${blocker.code}] ${blocker.detail}`);
    }
    process.exitCode = 1;
    return;
  }

  if (result.noop) {
    console.log("Article editor schema is already applied — nothing to do.");
    return;
  }

  const verb = apply ? "Applied" : "Planned";
  console.log(
    `${verb} the additive article editor schema ` +
      `(${result.summary.projectedCollectionCount} data collections after apply):`,
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
