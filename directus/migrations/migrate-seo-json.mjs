import path from "node:path";
import { open, readFile } from "node:fs/promises";

import { DirectusAdminClient, isMainModule } from "../schema/apply-schema.mjs";
import {
  assertArtifactDirectory,
  assertSafeArtifact,
  serializeArtifact,
  writeArtifactsExclusive,
} from "../releases/lib/artifacts.mjs";
import { sha256Hex } from "./migrate-product-gallery.mjs";

/**
 * Task 15 (R11): map the legacy scalar SEO fields of the five content
 * collections into the additive `seo` JSON of the vendored
 * @directus-labs/seo-plugin 1.1.1.
 *
 * Collections and scalar sources (from schema/blueprint.mjs):
 * - home_page:  seo_title, seo_description, canonical_url, og_image, is_indexable
 * - pages:      seo_title, seo_description, canonical_url, og_image, is_indexable
 * - categories: seo_title, seo_description, og_image, is_indexable (no canonical)
 * - products:   seo_title, seo_description, og_image, is_indexable (no canonical)
 * - articles:   seo_title, seo_description, og_image (no canonical, no robots)
 *
 * Mapping (plugin JSON contract):
 * - seo_title             -> seo.title
 * - seo_description       -> seo.meta_description
 * - canonical_url         -> seo.additional_fields.canonical_url
 * - og_image (file uuid)  -> seo.og_image (raw UUID string)
 * - is_indexable === false-> seo.no_index = true (true keeps the JSON default)
 * - no scalar source exists for seo.no_follow — the key is never written.
 *
 * INVARIANTS (each covered by migrate-seo-json.test.mjs):
 * 1. only items with at least one non-empty mapped scalar are candidates;
 * 2. only items whose `seo` is currently null/absent are patched — an existing
 *    JSON value (including a corrupted string/array) is NEVER overwritten;
 * 3. the scalar fields are read-only sources: every write carries ONLY the
 *    `seo` key, so nothing else on the item can change;
 * 4. the new JSON contains only keys with non-empty sources — no empty
 *    strings, no nulls inside the JSON;
 * 5. the dry run reports per collection: candidates, skipped-because-JSON-
 *    exists, per-field mapping counts, plus a sampled diff (first 5 items);
 * 6. apply is resumable: processed item ids are appended to a checkpoint
 *    artifact, an interrupted run (e.g. HTTP 401 admin-token expiry, ~15 min)
 *    fails fast with progress and a re-run continues where it stopped (items
 *    whose seo became non-null are skipped); a full re-run after completion
 *    is a clean no-op (zero patches);
 * 7. rollback uses the apply before-state (item ids + prior seo values) and
 *    sets `seo` back to exactly the prior value (null) for exactly those
 *    items, verifying by re-fetch — scalars are never touched;
 * 8. reconcile re-fetches every touched item and verifies seo non-null, the
 *    JSON parses, and the scalars are unchanged (order-insensitive sha256 of
 *    the scalar snapshot captured in the before-state).
 *
 * Modes (run each into a FRESH output directory — the artifact writers refuse
 * existing files; an interrupted apply resumes into a NEW directory, seeding
 * --checkpoint=<ndjson of the interrupted run> when available):
 * - default (--dry-run): read-only plan written to <output>/seo-json-plan.json.
 * - --apply --release-id=<id>: per-item awaited PATCHes, artifacts
 *   seo-json-apply.json + seo-json-before-state.ndjson +
 *   seo-json-checkpoint.ndjson.
 * - --reconcile --before-state=<ndjson>: verification written to
 *   <output>/seo-json-reconcile.json.
 * - --rollback --before-state=<ndjson>: seo=null restore written to
 *   <output>/seo-json-rollback.json.
 */

export const SEO_JSON_FIELD = "seo";
export const SEO_JSON_COLLECTIONS = [
  "home_page",
  "pages",
  "categories",
  "products",
  "articles",
];

/**
 * Per-collection scalar sources. Keys without a scalar on the collection are
 * simply absent — the mapping skips them by construction.
 */
export const COLLECTION_CONFIG = {
  home_page: {
    singleton: true,
    scalars: {
      title: "seo_title",
      metaDescription: "seo_description",
      canonicalUrl: "canonical_url",
      ogImage: "og_image",
      indexable: "is_indexable",
    },
  },
  pages: {
    singleton: false,
    scalars: {
      title: "seo_title",
      metaDescription: "seo_description",
      canonicalUrl: "canonical_url",
      ogImage: "og_image",
      indexable: "is_indexable",
    },
  },
  categories: {
    singleton: false,
    scalars: {
      title: "seo_title",
      metaDescription: "seo_description",
      ogImage: "og_image",
      indexable: "is_indexable",
    },
  },
  products: {
    singleton: false,
    scalars: {
      title: "seo_title",
      metaDescription: "seo_description",
      ogImage: "og_image",
      indexable: "is_indexable",
    },
  },
  articles: {
    singleton: false,
    scalars: {
      title: "seo_title",
      metaDescription: "seo_description",
      ogImage: "og_image",
    },
  },
};

export const PAGE_SIZE = 100;
export const MAX_PAGES = 200;
/** Sampled diff size of the dry-run report. */
export const SAMPLE_SIZE = 5;

export const EXPECTED_AFTER = { candidates: 0, patches: 0 };

const relationId = (value) =>
  typeof value === "string" ? value : (value?.id ?? null);

const nonEmptyString = (value) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

/** The ordered scalar field names of a collection (fetch + hash scope). */
export function scalarFieldNames(collection) {
  const { scalars } = COLLECTION_CONFIG[collection];
  return [scalars.title, scalars.metaDescription, scalars.ogImage]
    .concat(scalars.canonicalUrl ? [scalars.canonicalUrl] : [])
    .concat(scalars.indexable ? [scalars.indexable] : []);
}

export const fetchFieldNames = (collection) => [
  "id",
  SEO_JSON_FIELD,
  ...scalarFieldNames(collection),
];

/**
 * An item's `seo` counts as existing (never overwritten) for EVERY value
 * except null/undefined — including corrupted strings, arrays and numbers.
 */
export function hasExistingJsonSeo(value) {
  return value !== null && value !== undefined;
}

/**
 * Pure scalar -> plugin-JSON mapping of ONE item (invariants 1 and 4).
 * Returns null when no mapped scalar is non-empty (not a candidate); the
 * `mapped` list carries which scalar fields contributed keys.
 */
export function buildSeoJson(item, collection) {
  const { scalars } = COLLECTION_CONFIG[collection];
  const json = {};
  const mapped = [];

  const title = nonEmptyString(item?.[scalars.title]);
  if (title) {
    json.title = title;
    mapped.push(scalars.title);
  }

  const description = nonEmptyString(item?.[scalars.metaDescription]);
  if (description) {
    json.meta_description = description;
    mapped.push(scalars.metaDescription);
  }

  if (scalars.canonicalUrl) {
    const canonical = nonEmptyString(item?.[scalars.canonicalUrl]);
    if (canonical) {
      json.additional_fields = { canonical_url: canonical };
      mapped.push(scalars.canonicalUrl);
    }
  }

  if (scalars.ogImage) {
    const imageId = relationId(item?.[scalars.ogImage]);
    if (imageId) {
      json.og_image = imageId;
      mapped.push(scalars.ogImage);
    }
  }

  if (scalars.indexable && item?.[scalars.indexable] === false) {
    json.no_index = true;
    mapped.push(scalars.indexable);
  }

  return mapped.length > 0 ? { json, mapped } : null;
}

/**
 * Order-insensitive sha256 of the scalar snapshot (the artifact canonicalize
 * sorts object keys), captured in the before-state and re-derived by
 * reconcile to prove the migration never modified the scalars.
 */
export function scalarsSha256(item, collection) {
  const names = scalarFieldNames(collection);
  const snapshot = Object.fromEntries(
    names.map((name) => [name, item?.[name] === undefined ? null : item[name]]),
  );
  return sha256Hex(serializeArtifact(snapshot));
}

/** The rollback/reconcile artifact row of one candidate item. */
export function buildBeforeStateRow(item, collection) {
  return {
    collection,
    id: item.id,
    prior_seo: item?.[SEO_JSON_FIELD] ?? null,
    scalars_sha256: scalarsSha256(item, collection),
  };
}

const pagedQuery = (page, pageSize, collection) =>
  new URLSearchParams({
    fields: fetchFieldNames(collection).join(","),
    sort: "id",
    limit: String(pageSize),
    page: String(page),
  });

/**
 * Reads the current schema state needed by the preconditions. Read-only.
 */
export async function collectSeoJsonState(client) {
  const collections = await client.request("/collections");
  const collectionNames = new Set(
    collections.map(({ collection }) => collection),
  );
  const seoFieldByCollection = {};
  for (const name of SEO_JSON_COLLECTIONS) {
    if (!collectionNames.has(name)) continue;
    const fields = await client.request(`/fields/${name}`);
    seoFieldByCollection[name] = (fields ?? []).some(
      ({ field }) => field === SEO_JSON_FIELD,
    );
  }
  return { collections, collectionNames, seoFieldByCollection };
}

/**
 * Pure evaluation of the STOP preconditions: every collection must exist and
 * already carry the additive `seo` field (schema:apply runs first).
 */
export function evaluateSeoJsonState(state) {
  const blockers = [];
  for (const name of SEO_JSON_COLLECTIONS) {
    if (!state.collectionNames.has(name)) {
      blockers.push({
        code: "missing-collection",
        detail: `required collection ${name} not found`,
      });
      continue;
    }
    if (!state.seoFieldByCollection[name]) {
      blockers.push({
        code: "missing-seo-field",
        detail: `${name}.${SEO_JSON_FIELD} not found — run npm run schema:apply first`,
      });
    }
  }
  return { ok: blockers.length === 0, blockers };
}

const emptyCollectionSummary = () => ({
  scanned: 0,
  candidates: 0,
  skippedJsonExists: 0,
  notCandidates: 0,
  mappingCounts: {},
  patches: 0,
});

const interruptedError = (progress, error) =>
  new Error(
    `seo JSON migration interrupted after ${progress.patchesDone}/${progress.candidatesTotal} candidate patch(es) ` +
      `(${progress.currentCollection}: item ${progress.currentId ?? "-"}): ${error.message}. ` +
      "Re-run the same command with a fresh admin token (new output directory, optionally --checkpoint=<ndjson>) " +
      "to resume — items whose seo is already non-null are skipped.",
    { cause: error },
  );

/**
 * Orchestrates the scalar -> JSON migration. Default mode is a dry run (no
 * writes). `apply` requires a `releaseId`; a stopped result performs no
 * writes even in apply mode. `checkpoint` is an optional set of already
 * processed `collection:id` keys (from an interrupted run) and
 * `checkpointWriter` receives one append per successful PATCH.
 */
export async function runSeoJsonMigration(
  client,
  {
    apply = false,
    releaseId = null,
    pageSize = PAGE_SIZE,
    checkpoint = new Set(),
    checkpointWriter = null,
  } = {},
) {
  if (apply && !releaseId) {
    throw new Error("--apply requires --release-id=<id>");
  }

  const state = await collectSeoJsonState(client);
  const evaluation = evaluateSeoJsonState(state);
  if (!evaluation.ok) {
    return {
      ok: false,
      stopped: true,
      applied: false,
      noop: false,
      releaseId,
      migration: "seo-json",
      blockers: evaluation.blockers,
      report: [],
      summary: { pageSize, collections: {}, totalCandidates: 0, totalPatches: 0 },
      beforeState: [],
      sampleDiff: [],
      expectedAfter: EXPECTED_AFTER,
    };
  }

  const report = [];
  const beforeState = [];
  const sampleDiff = [];
  const collectionsSummary = {};
  const planned = [];
  let totalScanned = 0;
  let pageLimitExceeded = false;

  for (const collection of SEO_JSON_COLLECTIONS) {
    const config = COLLECTION_CONFIG[collection];
    const summary = emptyCollectionSummary();

    let items = [];
    if (config.singleton) {
      // Directus quirk: the singleton item GET returns an OBJECT.
      const fetched = await client.request(
        `/items/${collection}?${pagedQuery(1, 1, collection).toString()}`,
      );
      const item = Array.isArray(fetched) ? fetched[0] : fetched;
      items = item ? [item] : [];
      summary.scanned = items.length;
    } else {
      let pages = 0;
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const rows = await client.request(
          `/items/${collection}?${pagedQuery(page, pageSize, collection).toString()}`,
        );
        if (!Array.isArray(rows) || rows.length === 0) break;
        pages = page;
        items.push(...rows);
        if (rows.length < pageSize) break;
        if (page === MAX_PAGES) pageLimitExceeded = true;
      }
      summary.scanned = items.length;
      if (items.length > 0) {
        report.push({
          action: "scan collection",
          collection,
          pages,
          scanned: items.length,
        });
      }
    }

    for (const item of items) {
      totalScanned += 1;
      if (hasExistingJsonSeo(item?.[SEO_JSON_FIELD])) {
        summary.skippedJsonExists += 1;
        continue;
      }
      const built = buildSeoJson(item, collection);
      if (!built) {
        summary.notCandidates += 1;
        continue;
      }
      summary.candidates += 1;
      for (const field of built.mapped) {
        summary.mappingCounts[field] = (summary.mappingCounts[field] ?? 0) + 1;
      }
      beforeState.push(buildBeforeStateRow(item, collection));
      if (sampleDiff.length < SAMPLE_SIZE) {
        const scalars = scalarFieldNames(collection);
        sampleDiff.push({
          collection,
          id: item.id,
          scalars: Object.fromEntries(
            scalars.map((name) => [name, item?.[name] ?? null]),
          ),
          proposed: built.json,
        });
      }
      planned.push({ collection, id: item.id, json: built.json, singleton: config.singleton });
    }

    collectionsSummary[collection] = summary;
  }

  const totalCandidates = planned.length;
  const summary = {
    pageSize,
    collections: collectionsSummary,
    totalScanned,
    totalCandidates,
    totalSkippedJsonExists: Object.values(collectionsSummary).reduce(
      (total, entry) => total + entry.skippedJsonExists,
      0,
    ),
    totalPatches: 0,
  };
  const noop = totalCandidates === 0;

  if (pageLimitExceeded) {
    return {
      ok: false,
      stopped: true,
      applied: false,
      noop: false,
      releaseId,
      migration: "seo-json",
      blockers: [{
        code: "page-limit-exceeded",
        detail: `stopped after MAX_PAGES=${MAX_PAGES} pages — rerun after investigating`,
      }],
      report,
      summary,
      beforeState,
      sampleDiff,
      expectedAfter: EXPECTED_AFTER,
    };
  }

  if (apply && !noop) {
    const checkpointKeys = checkpoint instanceof Set ? checkpoint : new Set(checkpoint);
    const progress = {
      patchesDone: 0,
      candidatesTotal: totalCandidates,
      currentCollection: null,
      currentId: null,
    };
    try {
      for (const entry of planned) {
        progress.currentCollection = entry.collection;
        progress.currentId = entry.id;
        if (checkpointKeys.has(`${entry.collection}:${entry.id}`)) {
          // Already processed by an interrupted run — count but do not write.
          collectionsSummary[entry.collection].patches += 1;
          summary.totalPatches += 1;
          progress.patchesDone += 1;
          continue;
        }
        const target = entry.singleton
          ? `/items/${entry.collection}`
          : `/items/${entry.collection}/${encodeURIComponent(entry.id)}`;
        await client.request(target, {
          method: "PATCH",
          body: JSON.stringify({ [SEO_JSON_FIELD]: entry.json }),
        });
        collectionsSummary[entry.collection].patches += 1;
        summary.totalPatches += 1;
        progress.patchesDone += 1;
        if (checkpointWriter) {
          await checkpointWriter.append({
            collection: entry.collection,
            id: entry.id,
          });
        }
      }
    } catch (error) {
      throw interruptedError(progress, error);
    }
    report.push({
      action: "apply patches",
      patches: summary.totalPatches,
      resumedFromCheckpoint: checkpointKeys.size,
    });
  }

  return {
    ok: true,
    stopped: false,
    applied: apply,
    noop,
    releaseId,
    migration: "seo-json",
    blockers: [],
    report,
    summary,
    beforeState,
    sampleDiff,
    expectedAfter: EXPECTED_AFTER,
  };
}

/**
 * Parses a seo JSON value that came back from Directus: objects pass, JSON
 * strings are parsed once, everything else fails (reconcile invariant 8).
 */
function parseSeoJson(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

const singleItemGet = async (client, collection, id) => {
  const fields = fetchFieldNames(collection).join(",");
  const fetched = await client.request(
    `/items/${collection}/${encodeURIComponent(id)}?fields=${fields}`,
  );
  // Directus quirk: single-item GETs return an OBJECT, list GETs an array.
  return Array.isArray(fetched) ? fetched[0] : fetched;
};

/**
 * Reconcile (invariant 8): re-fetch every before-state item and verify
 * - seo is non-null and parses as the plugin JSON object;
 * - the scalar snapshot hash is unchanged (order-insensitive).
 * Read-only.
 */
export async function reconcileSeoJson(client, { beforeState }) {
  const violations = [];
  const summary = {
    items: beforeState.length,
    verified: 0,
    seoMissing: 0,
    seoUnparseable: 0,
    scalarsChanged: 0,
    missingItems: 0,
  };

  for (const row of beforeState) {
    const item = await singleItemGet(client, row.collection, row.id);
    if (!item) {
      violations.push({
        code: "missing-item",
        collection: row.collection,
        id: row.id,
      });
      summary.missingItems += 1;
      continue;
    }

    const seoValue = item?.[SEO_JSON_FIELD];
    if (seoValue === null || seoValue === undefined) {
      violations.push({
        code: "seo-null",
        collection: row.collection,
        id: row.id,
        detail: `${row.collection}.${row.id} seo is null after the migration`,
      });
      summary.seoMissing += 1;
      continue;
    }
    if (parseSeoJson(seoValue) === null) {
      violations.push({
        code: "seo-unparseable",
        collection: row.collection,
        id: row.id,
        detail: `${row.collection}.${row.id} seo does not parse as the plugin JSON object`,
      });
      summary.seoUnparseable += 1;
      continue;
    }

    if (scalarsSha256(item, row.collection) !== row.scalars_sha256) {
      violations.push({
        code: "scalars-changed",
        collection: row.collection,
        id: row.id,
        detail: `${row.collection}.${row.id} scalar SEO fields changed since the before-state`,
      });
      summary.scalarsChanged += 1;
      continue;
    }

    summary.verified += 1;
  }

  return { ok: violations.length === 0, violations, summary };
}

/**
 * Rollback (invariant 7): restore `seo` to the exact before-state value
 * (null for every item this migration patched) for exactly the recorded
 * items, verifying by re-fetch. The write set carries ONLY the seo key.
 */
export async function rollbackSeoJson(client, { beforeState }) {
  const violations = [];
  const summary = {
    items: beforeState.length,
    patches: 0,
    verified: 0,
    mismatchedAfterRestore: 0,
  };

  for (const row of beforeState) {
    const config = COLLECTION_CONFIG[row.collection];
    const target = config.singleton
      ? `/items/${row.collection}`
      : `/items/${row.collection}/${encodeURIComponent(row.id)}`;
    await client.request(target, {
      method: "PATCH",
      body: JSON.stringify({ [SEO_JSON_FIELD]: row.prior_seo ?? null }),
    });
    summary.patches += 1;

    const item = await singleItemGet(client, row.collection, row.id);
    const live = item?.[SEO_JSON_FIELD] ?? null;
    if (live !== (row.prior_seo ?? null)) {
      violations.push({
        code: "restore-mismatch",
        collection: row.collection,
        id: row.id,
        detail: `${row.collection}.${row.id} seo is ${JSON.stringify(live)}, expected ${JSON.stringify(row.prior_seo ?? null)}`,
      });
      summary.mismatchedAfterRestore += 1;
      continue;
    }
    summary.verified += 1;
  }

  return { ok: violations.length === 0, violations, summary };
}

// ---------------------------------------------------------------------------
// Artifacts + CLI
// ---------------------------------------------------------------------------

/**
 * Incremental NDJSON appender for the apply checkpoint (invariant 6). Opens
 * exclusively ("wx") — re-runs go to a FRESH output directory and may seed
 * --checkpoint=<previous file>.
 */
export async function openCheckpointWriter(filename) {
  const handle = await open(filename, "wx");
  let offset = 0;
  return {
    async append(entry) {
      const buffer = Buffer.from(`${JSON.stringify(entry)}\n`, "utf8");
      const result = await handle.write(buffer, 0, buffer.length, offset);
      offset += result.bytesWritten;
    },
    async close() {
      await handle.close();
    },
  };
}

const writeNdjsonExclusive = async (filename, rows) => {
  for (const row of rows) assertSafeArtifact(row);
  const handle = await open(filename, "wx");
  try {
    await handle.writeFile(
      rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""),
      "utf8",
    );
  } finally {
    await handle.close();
  }
  return filename;
};

export async function readBeforeState(filename) {
  const content = await readFile(filename, "utf8");
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

const argumentValue = (name, args = process.argv.slice(2)) => {
  const prefix = `--${name}=`;
  return args.find((value) => value.startsWith(prefix))?.slice(prefix.length);
};

async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes("--rollback")
    ? "rollback"
    : args.includes("--reconcile")
      ? "reconcile"
      : args.includes("--apply")
        ? "apply"
        : "dry-run";
  const releaseId = argumentValue("release-id", args) ?? null;
  const outputDirectory = argumentValue("output", args) ?? null;
  const beforeStateFile = argumentValue("before-state", args);
  const checkpointFile = argumentValue("checkpoint", args);

  if (mode !== "apply" && mode !== "dry-run" && !beforeStateFile) {
    throw new Error(`--${mode} requires --before-state=<ndjson> (captured by the apply run)`);
  }

  const client = await DirectusAdminClient.connectFromEnvironment();

  let directory = null;
  if (outputDirectory) {
    const repositoryRoot = path.resolve(import.meta.dirname, "../..");
    directory = await assertArtifactDirectory(outputDirectory, {
      repositoryRoot,
      scanExistingFiles: true,
    });
  }

  if (mode === "reconcile" || mode === "rollback") {
    const beforeState = await readBeforeState(beforeStateFile);
    const result = mode === "reconcile"
      ? await reconcileSeoJson(client, { beforeState })
      : await rollbackSeoJson(client, { beforeState });

    if (directory) {
      const filename = `seo-json-${mode}.json`;
      await writeArtifactsExclusive(directory, {
        [filename]: assertSafeArtifact({
          migration: "seo-json",
          mode,
          beforeStateFile,
          ...result,
        }),
      });
      console.log(`Wrote ${mode} result to ${path.join(directory, filename)}`);
    }

    const s = result.summary;
    if (mode === "reconcile") {
      console.log(
        `Reconciled ${s.items} patched item(s): ${s.verified} verified, ` +
          `${s.scalarsChanged} scalar-change(s), ${s.seoMissing} null seo, ${s.seoUnparseable} unparseable, ${s.missingItems} missing.`,
      );
    } else {
      console.log(
        `Rolled back ${s.patches} item patch(es): ${s.verified} verified null restores.`,
      );
    }
    if (!result.ok) {
      console.error(`${mode} FAILED with ${result.violations.length} violation(s):`);
      for (const violation of result.violations) {
        console.error(`- [${violation.code}] ${violation.collection}.${violation.id}: ${violation.detail ?? ""}`);
      }
      process.exitCode = 1;
    }
    return;
  }

  let checkpoint = new Set();
  if (mode === "apply" && checkpointFile) {
    const rows = await readBeforeState(checkpointFile);
    checkpoint = new Set(rows.map(({ collection, id }) => `${collection}:${id}`));
  }

  let checkpointWriter = null;
  if (mode === "apply" && directory) {
    checkpointWriter = await openCheckpointWriter(
      path.join(directory, "seo-json-checkpoint.ndjson"),
    );
  }

  let result;
  try {
    result = await runSeoJsonMigration(client, {
      apply: mode === "apply",
      releaseId,
      checkpoint,
      checkpointWriter,
    });
  } finally {
    if (checkpointWriter) await checkpointWriter.close();
  }

  if (directory) {
    const { beforeState, ...planArtifact } = result;
    const planName = mode === "apply" ? "seo-json-apply.json" : "seo-json-plan.json";
    await writeArtifactsExclusive(directory, {
      [planName]: assertSafeArtifact({
        migration: "seo-json",
        mode,
        releaseId,
        ...planArtifact,
      }),
    });
    const beforeStateFilename = await writeNdjsonExclusive(
      path.join(directory, "seo-json-before-state.ndjson"),
      beforeState,
    );
    console.log(`Wrote ${mode} plan to ${path.join(directory, planName)}`);
    console.log(`Wrote before-state to ${beforeStateFilename}`);
  }

  if (result.stopped) {
    console.error(
      `STOP: ${result.blockers.length} blocker(s) prevented the seo JSON migration:`,
    );
    for (const blocker of result.blockers) {
      console.error(`- [${blocker.code}] ${blocker.detail}`);
    }
    process.exitCode = 1;
    return;
  }

  if (result.noop) {
    console.log(
      "seo JSON is already migrated — nothing to do " +
        `(${result.summary.totalScanned} item(s) scanned, ${result.summary.totalSkippedJsonExists} with existing JSON).`,
    );
    return;
  }

  const verb = mode === "apply" ? "Applied" : "Planned";
  const s = result.summary;
  console.log(
    `${verb} the seo JSON migration: ${s.totalCandidates} candidate item(s) across ` +
      `${SEO_JSON_COLLECTIONS.join(", ")} (${s.totalSkippedJsonExists} skipped: seo JSON already exists).`,
  );
  for (const collection of SEO_JSON_COLLECTIONS) {
    const entry = s.collections[collection];
    console.log(
      `- ${collection}: ${entry.candidates} candidate(s), ${entry.skippedJsonExists} json-exists skip(s), ` +
        `${entry.patches} patch(es)${mode === "apply" ? "" : " planned"}, mappings ` +
        `${Object.entries(entry.mappingCounts).map(([field, count]) => `${field}:${count}`).join(" ") || "—"}`,
    );
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
