// Task 13 (R9): batch apply for the field-level catalog importer.
//
// Contract highlights (ADR-003):
// - default mode is a DRY RUN; writes require apply + releaseId;
// - an opt-in profile without an approval reference refuses BEFORE any
//   client request;
// - the input must still match the immutable manifest (byte-identical);
// - every existing product is PATCHed with the MINIMAL diff of allowed
//   fields — a full-payload PATCH is impossible by construction and is
//   additionally asserted at write time;
// - new products are always created with status "draft";
// - every write is retried a bounded number of times; a failing write
//   interrupts the batch with the exact --resume=<offset> hint, and the
//   append-only NDJSON report plus the exclusive before-state artifact
//   live in the closed release directory (never inside the repository).
//
// Reads are always paged (500 per page, sort=id); limit=-1 never appears.

import { createHash } from "node:crypto";
import { open, readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  assertArtifactDirectory,
  assertSafeArtifact,
  writeArtifactsExclusive,
} from "../releases/lib/artifacts.mjs";
import { assertProfileApproval } from "./profiles.mjs";
import { normalizeCode } from "./normalize.mjs";
import {
  BEFORE_STATE_ARTIFACT_NAME,
  MANIFEST_ARTIFACT_NAME,
  PLAN_ARTIFACT_NAME,
  REPORT_ARTIFACT_NAME,
  SUMMARY_ARTIFACT_NAME,
  sha256Hex,
  validateManifest,
  verifyManifestInput,
} from "./manifest.mjs";
import { buildPlans, planArtifactEntry } from "./plan.mjs";

export const PAGE_SIZE = 500;
export const MAX_PAGES = 400;
/** 12 971 products at 500/page need 26 pages; 400 pages guard ~200k rows. */

export const PRODUCTS_COLLECTION = "products";
export const ANALOGS_COLLECTION = "products_analogs";

/**
 * Fields whose values the importer must NEVER touch under the given
 * profile (allowlisted fields are excluded per profile).
 */
export const PROTECTED_BASE_FIELDS = [
  "id",
  "status",
  "title",
  "slug",
  "category",
  "main_image",
  "seo_title",
  "seo_description",
  "og_image",
  "currency",
  "is_featured",
  "show_on_homepage",
];

export const protectedFieldsFor = (profile) =>
  PROTECTED_BASE_FIELDS.filter((field) => !profile.fields.includes(field));

export function protectedRowHash(product, profile) {
  const picked = {};
  for (const field of protectedFieldsFor(profile)) {
    const value = product?.[field];
    picked[field] =
      value && typeof value === "object" ? (value.id ?? null) : (value ?? null);
  }
  return sha256Hex(JSON.stringify(picked, null, 0));
}

const pageQuery = (fields, { page, pageSize, sort = "id" }) =>
  new URLSearchParams({
    fields: fields.join(","),
    sort,
    limit: String(pageSize),
    page: String(page),
  }).toString();

async function readPaged(client, collection, fields, { pageSize, maxPages }) {
  const rows = [];
  let pages = 0;
  let pageLimitExceeded = false;
  for (let page = 1; page <= maxPages; page += 1) {
    const chunk = await client.request(
      `/items/${collection}?${pageQuery(fields, { page, pageSize })}`,
    );
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    pages = page;
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    if (page === maxPages) pageLimitExceeded = true;
  }
  return { rows, pages, pageLimitExceeded };
}

export const readProductsPaged = (client, fields, options) =>
  readPaged(client, PRODUCTS_COLLECTION, fields, options);

export const readEdgesPaged = (client, options) =>
  readPaged(
    client,
    ANALOGS_COLLECTION,
    ["id", "product_from", "product_to", "relation_type", "canonical_key"],
    options,
  );

const skuKeyOf = (product) => {
  const normalized = String(product?.sku_normalized ?? "").trim();
  if (normalized !== "") return normalizeCode(normalized);
  return normalizeCode(product?.sku);
};

export function buildImporterIndex(products, edges = []) {
  const bySkuKey = new Map();
  const productsById = new Map();
  for (const product of products) {
    const key = skuKeyOf(product);
    if (key && !bySkuKey.has(key)) bySkuKey.set(key, product);
    productsById.set(String(product.id), product);
  }
  const edgeKeys = new Set(
    edges
      .map((edge) => edge?.canonical_key)
      .filter((key) => typeof key === "string" && key !== ""),
  );
  const edgeIds = new Set(edges.map((edge) => String(edge.id)));
  return { bySkuKey, productsById, edgeKeys, edgeIds };
}

export async function collectImporterState(
  client,
  { profile, pageSize = PAGE_SIZE, maxPages = MAX_PAGES } = {},
) {
  const collections = await client.request("/collections");
  const collectionNames = new Set(
    collections.map(({ collection }) => collection),
  );
  const hasProducts = collectionNames.has(PRODUCTS_COLLECTION);

  let productFieldNames = [];
  if (hasProducts) {
    const fields = await client.request(`/fields/${PRODUCTS_COLLECTION}`);
    productFieldNames = (fields ?? []).map(({ field }) => field);
  }

  const productFields = [
    ...new Set([
      "id",
      "sku",
      "sku_normalized",
      "status",
      ...profile.fields,
      ...protectedFieldsFor(profile),
    ]),
  ];

  const products = hasProducts
    ? await readProductsPaged(client, productFields, { pageSize, maxPages })
    : { rows: [], pages: 0, pageLimitExceeded: false };

  const wantsEdges = profile.relations.some(
    (relation) => relation.collection === ANALOGS_COLLECTION,
  );
  const edges =
    wantsEdges && collectionNames.has(ANALOGS_COLLECTION)
      ? await readEdgesPaged(client, { pageSize, maxPages })
      : { rows: [], pages: 0, pageLimitExceeded: false };

  const index = buildImporterIndex(products.rows, edges.rows);
  return {
    collectionNames,
    hasProducts,
    productFieldNames,
    products: products.rows,
    productPages: products.pages,
    edges: edges.rows,
    edgePages: edges.pages,
    pageLimitExceeded: products.pageLimitExceeded || edges.pageLimitExceeded,
    ...index,
  };
}

export function evaluateImporterState(state, { profile }) {
  const blockers = [];
  if (!state.hasProducts) {
    blockers.push({
      code: "missing-collection",
      detail: `required collection ${PRODUCTS_COLLECTION} not found`,
    });
  }
  for (const field of profile.fields) {
    if (state.hasProducts && !state.productFieldNames.includes(field)) {
      blockers.push({
        code: "missing-product-field",
        detail: `${PRODUCTS_COLLECTION}.${field} not found — profile ${profile.name} needs an approved schema release before it can run`,
      });
    }
  }
  for (const relation of profile.relations) {
    if (!state.collectionNames.has(relation.collection)) {
      blockers.push({
        code: "missing-relation-collection",
        detail: `required relation collection ${relation.collection} not found`,
      });
    }
  }
  if (state.pageLimitExceeded) {
    blockers.push({
      code: "page-limit-exceeded",
      detail: `stopped after MAX_PAGES=${MAX_PAGES} pages — rerun after investigating`,
    });
  }
  return { ok: blockers.length === 0, blockers };
}

export function assertPatchWithinAllowlist(profile, patch) {
  const allowed = new Set(profile.fields);
  for (const key of Object.keys(patch ?? {})) {
    if (!allowed.has(key)) {
      throw new Error(
        `refusing PATCH outside the ${profile.name} allowlist: field "${key}"`,
      );
    }
  }
  return true;
}

export function assertCreatePayloadAllowed(profile, payload) {
  const allowed = new Set([...profile.fields, "status", "sku"]);
  for (const key of Object.keys(payload ?? {})) {
    if (!allowed.has(key)) {
      throw new Error(
        `refusing CREATE outside the ${profile.name} allowlist: field "${key}"`,
      );
    }
  }
  if (payload?.status !== "draft") {
    throw new Error("imports may only create products with status draft");
  }
  return true;
}

export function idempotencyKeyFor(plan) {
  return sha256Hex(
    JSON.stringify({
      skuKey: plan.skuKey,
      outcome: plan.outcome,
      writes: plan.createPayload ?? plan.patch ?? null,
      edges: plan.edges ?? [],
    }),
  );
}

/**
 * Before-state rows for every existing product the plan would write:
 * the allowlisted field values (as {field, value} pairs — field names stay
 * data, not keys, so the artifact remains scanner-safe) plus the hash of
 * the protected fields, which rollback verifies before restoring.
 */
export function buildBeforeState(plans, state, profile) {
  const seen = new Set();
  const rows = [];
  for (const plan of plans) {
    if (plan.outcome !== "patch-minimal-diff" || !plan.productId) continue;
    if (seen.has(plan.productId)) continue;
    seen.add(plan.productId);
    const product = state.productsById.get(plan.productId);
    if (!product) continue;
    rows.push(
      assertSafeArtifact({
        product_id: plan.productId,
        before: profile.fields.map((field) => ({
          field,
          value:
            product[field] && typeof product[field] === "object"
              ? (product[field].id ?? null)
              : (product[field] ?? null),
        })),
        protected_sha256: protectedRowHash(product, profile),
      }),
    );
  }
  return rows;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function writeWithRetry(operation, { retryLimit, retryDelayMs, onRetry }) {
  let attempt = 0;
  for (;;) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= retryLimit) throw error;
      attempt += 1;
      onRetry?.(attempt);
      await sleep(retryDelayMs);
    }
  }
}

const fileExists = async (filename) => {
  try {
    await stat(filename);
    return true;
  } catch {
    return false;
  }
};

async function writeNdjsonExclusive(filename, rows) {
  const handle = await open(filename, "wx");
  try {
    await handle.writeFile(
      rows.map((row) => JSON.stringify(row)).join("\n") +
        (rows.length ? "\n" : ""),
      "utf8",
    );
  } finally {
    await handle.close();
  }
  return filename;
}

const interruptedError = (completedOffset, releaseId, error) =>
  new Error(
    `catalog import interrupted after ${completedOffset} completed record(s) ` +
      `(${releaseId}): ${error.message}. ` +
      `Re-run the same command with --resume=${completedOffset} — already-written records are skipped idempotently.`,
    { cause: error },
  );

/**
 * Orchestrates one importer run (dry-run by default). All writes go through
 * the per-record plan; NOTHING outside the profile allowlist is ever sent.
 */
export async function runImportApply(
  client,
  {
    profile,
    manifest,
    normalizedRows,
    apply = false,
    releaseId = null,
    approvalRef = null,
    resumeOffset = 0,
    outputDirectory = null,
    pageSize = PAGE_SIZE,
    maxPages = MAX_PAGES,
    retryLimit = 2,
    retryDelayMs = 50,
    now = () => new Date().toISOString(),
  },
) {
  if (apply && !releaseId) {
    throw new Error("--apply requires --release-id=<id>");
  }
  if (!Number.isInteger(resumeOffset) || resumeOffset < 0) {
    throw new Error("resumeOffset must be a non-negative integer");
  }
  // Approval guard fires BEFORE any client request (also for dry runs).
  assertProfileApproval(profile, approvalRef);
  const manifestValidation = validateManifest(manifest, {
    knownProfileNames: [profile.name],
  });
  if (!manifestValidation.ok) {
    throw new Error(
      `invalid import manifest: ${manifestValidation.errors.join("; ")}`,
    );
  }

  const state = await collectImporterState(client, {
    profile,
    pageSize,
    maxPages,
  });
  const evaluation = evaluateImporterState(state, { profile });
  if (!evaluation.ok) {
    return {
      ok: false,
      stopped: true,
      applied: false,
      noop: false,
      releaseId,
      profile: profile.name,
      blockers: evaluation.blockers,
      reportEntries: [],
      beforeState: [],
      summary: null,
    };
  }

  const { plans, summary: planSummary } = buildPlans({
    normalizedRows,
    bySkuKey: state.bySkuKey,
    edgeKeys: state.edgeKeys,
    profile,
  });

  const beforeState = buildBeforeState(plans, state, profile);

  let directory = null;
  let reportHandle = null;
  const reportEntries = [];
  const appendReport = async (entry) => {
    reportEntries.push(entry);
    if (reportHandle) {
      await reportHandle.writeFile(`${JSON.stringify(entry)}\n`, "utf8");
    }
  };

  if (outputDirectory) {
    const repositoryRoot = path.resolve(import.meta.dirname, "../..");
    directory = await assertArtifactDirectory(outputDirectory, {
      repositoryRoot,
      scanExistingFiles: true,
    });

    const manifestPath = path.join(directory, MANIFEST_ARTIFACT_NAME);
    if (await fileExists(manifestPath)) {
      // Resume / dry-run-then-apply in the same directory: the stored
      // manifest must still match the current input byte-for-byte.
      const stored = JSON.parse(await readFile(manifestPath, "utf8"));
      const verification = verifyManifestInput(stored, {
        sha256: manifest.input.sha256,
        bytes: manifest.input.bytes,
        rowCount: manifest.input.row_count,
      });
      if (!verification.ok) {
        throw new Error(
          `input file changed since the stored manifest (${verification.mismatches.join("; ")}) — start a new release instead of resuming`,
        );
      }
    } else {
      await writeArtifactsExclusive(directory, {
        [MANIFEST_ARTIFACT_NAME]: manifest,
      });
    }

    if (!(await fileExists(path.join(directory, PLAN_ARTIFACT_NAME)))) {
      await writeArtifactsExclusive(directory, {
        [PLAN_ARTIFACT_NAME]: {
          tool: "directus/importer",
          profile: profile.name,
          input_sha256: manifest.input.sha256,
          row_count: manifest.input.row_count,
          summary: planSummary,
          entries: plans.map(planArtifactEntry),
        },
      });
    }

    if (
      apply &&
      !(await fileExists(path.join(directory, BEFORE_STATE_ARTIFACT_NAME)))
    ) {
      await writeNdjsonExclusive(
        path.join(directory, BEFORE_STATE_ARTIFACT_NAME),
        beforeState,
      );
    }

    // The append-only report file only receives APPLY entries; dry runs
    // keep their entries in memory (their plan lands in the plan artifact).
    if (apply) {
      reportHandle = await open(path.join(directory, REPORT_ARTIFACT_NAME), "a");
    }
  }

  const writeSummary = {
    creates: 0,
    patches: 0,
    edges: 0,
  };
  let retries = 0;

  try {
    for (let index = 0; index < plans.length; index += 1) {
      const plan = plans[index];
      // DRY RUN: the loop performs no writes and no report appends beyond
      // the in-memory plan artifact (the report file is apply-only).
      if (!apply) continue;
      if (index < resumeOffset) {
        await appendReport({
          ts: now(),
          release_id: releaseId,
          offset: plan.offset,
          outcome: "resume-skipped",
        });
        continue;
      }

      if (plan.outcome === "conflict" || plan.outcome === "skip") {
        await appendReport({
          ts: now(),
          release_id: releaseId,
          offset: plan.offset,
          outcome: plan.outcome,
          forbidden_fields: plan.forbiddenFields ?? [],
          conflict_codes: plan.conflictCodes ?? [],
        });
        continue;
      }

      try {
        if (plan.outcome === "create-draft") {
          // INVARIANT 4 belt-and-suspenders: the POST always carries
          // status=draft even when the row had no status key.
          const payload = { status: "draft", ...plan.createPayload };
          assertCreatePayloadAllowed(profile, payload);
          const created = await writeWithRetry(
            () =>
              client.request(`/items/${PRODUCTS_COLLECTION}`, {
                method: "POST",
                body: JSON.stringify(payload),
              }),
            { retryLimit, retryDelayMs, onRetry: () => { retries += 1; } },
          );
          writeSummary.creates += 1;
          await appendReport({
            ts: now(),
            release_id: releaseId,
            offset: plan.offset,
            outcome: plan.outcome,
            product_id: created?.id == null ? null : String(created.id),
            fields: plan.fields ?? [],
            forced_draft: plan.statusForcedToDraft === true,
            idempotency_key: idempotencyKeyFor(plan),
          });
          continue;
        }

        if (plan.outcome === "patch-minimal-diff") {
          if (Object.keys(plan.patch).length > 0) {
            assertPatchWithinAllowlist(profile, plan.patch);
            await writeWithRetry(
              () =>
                client.request(
                  `/items/${PRODUCTS_COLLECTION}/${encodeURIComponent(plan.productId)}`,
                  { method: "PATCH", body: JSON.stringify(plan.patch) },
                ),
              { retryLimit, retryDelayMs, onRetry: () => { retries += 1; } },
            );
            writeSummary.patches += 1;
          }
          const edgesCreated = [];
          for (const edge of plan.edges) {
            const created = await writeWithRetry(
              () =>
                client.request(`/items/${edge.collection}`, {
                  method: "POST",
                  body: JSON.stringify({
                    product_from: edge.product_from,
                    product_to: edge.product_to,
                    relation_type: edge.relation_type,
                    canonical_key: edge.canonical_key,
                    source_name: edge.source_name,
                    note: edge.note,
                  }),
                }),
              { retryLimit, retryDelayMs, onRetry: () => { retries += 1; } },
            );
            writeSummary.edges += 1;
            edgesCreated.push(created?.id == null ? null : String(created.id));
          }
          await appendReport({
            ts: now(),
            release_id: releaseId,
            offset: plan.offset,
            outcome: plan.outcome,
            product_id: plan.productId,
            fields: plan.changedFields ?? [],
            edges_created: edgesCreated,
            idempotency_key: idempotencyKeyFor(plan),
          });
        }
      } catch (error) {
        await appendReport({
          ts: now(),
          release_id: releaseId,
          offset: plan.offset,
          outcome: "interrupted",
          detail_code: "write-failed",
        });
        throw interruptedError(index, releaseId, error);
      }
    }
  } finally {
    if (reportHandle) await reportHandle.close();
  }

  const noop =
    planSummary.create === 0 &&
    planSummary.patch === 0 &&
    planSummary.edgesPlanned === 0;
  const summary = {
    profile: profile.name,
    mode: apply ? "apply" : "dry-run",
    pageSize,
    productPages: state.productPages,
    edgePages: state.edgePages,
    rows: planSummary,
    writes: apply ? writeSummary : { creates: 0, patches: 0, edges: 0 },
    retries,
    resumedFrom: resumeOffset,
    noop,
  };

  if (directory && !(await fileExists(path.join(directory, SUMMARY_ARTIFACT_NAME)))) {
    await writeArtifactsExclusive(directory, {
      [SUMMARY_ARTIFACT_NAME]: {
        tool: "directus/importer",
        release_id: releaseId,
        completed_at: now(),
        ...summary,
      },
    });
  }

  return {
    ok: true,
    stopped: false,
    applied: apply,
    noop,
    releaseId,
    profile: profile.name,
    blockers: [],
    summary,
    reportEntries,
    beforeState,
  };
}
