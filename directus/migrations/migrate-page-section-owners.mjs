import path from "node:path";
import { open, readFile } from "node:fs/promises";

import { DirectusAdminClient, isMainModule } from "../schema/apply-schema.mjs";
import {
  assertArtifactDirectory,
  assertSafeArtifact,
  writeArtifactsExclusive,
} from "../releases/lib/artifacts.mjs";

/**
 * Owner-XOR migration for page_sections: every section row must end up with
 * EXACTLY ONE owner. The production before-state is 13 rows — 11 dual-owner
 * (both page and home_page) which become home-owned (page = null), and
 * 2 page-only rows which stay page-owned (home_page = null). After apply a
 * database CHECK constraint enforces the single-owner rule and the
 * `page_sections.page` field becomes nullable.
 *
 * Modes:
 * - default (--dry-run): read the owner table, build the before-state NDJSON
 *   and the patch plan; STOP before any write when a precondition fails.
 * - --apply --release-id=<id>: the nullable field meta first (a required field
 *   rejects page=null), then the row patches,
 *   then the operator executes sql/page-section-owner-xor-up.sql in the same
 *   maintenance window (Directus REST cannot run raw SQL).
 * - --restore --before-state=<file>: rollback path — restore both owner
 *   fields from the release packet before-state, then make `page` required
 *   again. The down SQL drops the CHECK constraint first.
 */

export const OWNER_COLLECTION = "page_sections";
export const OWNER_XOR_CHECK_NAME = "page_sections_exactly_one_owner_check";

export const EXPECTED_OWNER_SPLIT = { total: 13, dualOwner: 11, pageOnly: 2 };

export const EXPECTED_AFTER = { total: 13, homeOwned: 11, pageOwned: 2, invalid: 0 };

const UP_SQL_RELATIVE_PATH = "migrations/sql/page-section-owner-xor-up.sql";

const relationId = (value) =>
  typeof value === "string" ? value : (value?.id ?? null);

const sectionQuery = () => new URLSearchParams({
  fields: "id,page,home_page",
  sort: "id",
  limit: "-1",
});

/**
 * Normalizes one row and decides its owner state: "dual" (both owners set),
 * "home" (home_page only), "page" (page only) or "ownerless" (both null).
 */
export function classifyRow(row) {
  const page = relationId(row?.page);
  const homePage = relationId(row?.home_page);
  const ownerState = page && homePage
    ? "dual"
    : homePage
      ? "home"
      : page
        ? "page"
        : "ownerless";
  return { id: row?.id, page, home_page: homePage, ownerState };
}

/**
 * The rollback artifact: one line per row with the fields needed to restore
 * both owner columns exactly as they were before the migration.
 */
export function buildBeforeState(rows) {
  return rows
    .map(classifyRow)
    .map(({ id, page, home_page }) => ({ id, page, home_page }))
    .toSorted((left, right) => String(left.id).localeCompare(String(right.id), "en"));
}

/**
 * Builds the patch plan for all EXPECTED rows. Dual-owner rows receive
 * { page: null } (they keep home_page); page-only rows are verified no-ops
 * ({ home_page: null } matches the current value, so nothing is written).
 */
export function buildPatchPlan(rows) {
  const patches = rows.map(classifyRow).map((row) => {
    if (row.ownerState === "dual") {
      return { id: row.id, owner: "home", patch: { page: null }, noop: false };
    }
    return { id: row.id, owner: "page", patch: { home_page: null }, noop: true };
  });
  return {
    patches,
    patchWrites: patches.filter((patch) => !patch.noop).length,
    noopPatches: patches.filter((patch) => patch.noop).length,
  };
}

/**
 * Pure evaluation of the STOP preconditions: exact total, no ownerless row,
 * the documented 11 dual + 2 page-only split, and every FK target existing.
 */
export function evaluateOwnerState(
  classifiedRows,
  { pageIds, homePageId, expected = EXPECTED_OWNER_SPLIT } = {},
) {
  const blockers = [];
  const counts = {
    total: classifiedRows.length,
    dualOwner: classifiedRows.filter((row) => row.ownerState === "dual").length,
    homeOwned: classifiedRows.filter((row) => row.ownerState === "home").length,
    pageOnly: classifiedRows.filter((row) => row.ownerState === "page").length,
    ownerless: classifiedRows.filter((row) => row.ownerState === "ownerless").length,
  };

  if (counts.total !== expected.total) {
    blockers.push({
      code: "unexpected-total",
      actual: counts.total,
      expected: expected.total,
    });
  }
  for (const row of classifiedRows) {
    if (row.ownerState !== "ownerless") continue;
    blockers.push({
      code: "ownerless-row",
      detail: `page_sections.${row.id} has neither page nor home_page`,
    });
  }
  if (
    counts.dualOwner !== expected.dualOwner ||
    counts.pageOnly !== expected.pageOnly
  ) {
    blockers.push({
      code: "unexpected-owner-split",
      actual: {
        dualOwner: counts.dualOwner,
        pageOnly: counts.pageOnly,
        homeOwned: counts.homeOwned,
      },
      expected,
    });
  }

  const knownPageIds = new Set(pageIds ?? []);
  for (const row of classifiedRows) {
    if (row.page && !knownPageIds.has(row.page)) {
      blockers.push({
        code: "missing-fk-target",
        field: "page",
        detail: `page_sections.${row.id} references unknown page ${row.page}`,
      });
    }
    if (row.home_page && row.home_page !== homePageId) {
      blockers.push({
        code: "missing-fk-target",
        field: "home_page",
        detail: `page_sections.${row.id} references unknown home_page ${row.home_page}`,
      });
    }
  }

  return { ok: blockers.length === 0, blockers, counts };
}

/**
 * Generates one UPDATE per before-state row so rollback can restore both
 * owner columns exactly. Emitted into the plan artifact next to the SQL.
 */
export function buildRollbackStatements(beforeState) {
  return beforeState.map(({ id, page, home_page }) => {
    const pageValue = page ? `'${page}'` : "NULL";
    const homeValue = home_page ? `'${home_page}'` : "NULL";
    return `UPDATE page_sections SET page = ${pageValue}, home_page = ${homeValue} WHERE id = '${id}';`;
  });
}

const nullableFieldPatch = () => JSON.stringify({
  meta: { required: false },
  schema: { is_nullable: true },
});

const requiredFieldPatch = () => JSON.stringify({
  meta: { required: true },
  schema: { is_nullable: false },
});

/**
 * Orchestrates the owner-XOR migration. Default mode is a dry run (no
 * writes). `apply` requires a `releaseId`; a stopped result performs no
 * writes even in apply mode. The database CHECK cannot run through the
 * Directus REST API, so apply reports it as a pending operator step that
 * must happen in the same maintenance window.
 */
export async function runOwnerMigration(
  client,
  { apply = false, releaseId = null, expected = EXPECTED_OWNER_SPLIT } = {},
) {
  if (apply && !releaseId) {
    throw new Error("--apply requires --release-id=<id>");
  }

  const rows = await client.request(
    `/items/${OWNER_COLLECTION}?${sectionQuery().toString()}`,
  );
  const pages = await client.request("/items/pages?fields=id&limit=-1");
  const homePage = await client.request("/items/home_page?fields=id");
  const homePageId = homePage?.id ?? null;

  const classifiedRows = rows.map(classifyRow);
  const evaluation = evaluateOwnerState(classifiedRows, {
    pageIds: pages.map(({ id }) => id),
    homePageId,
    expected,
  });
  const beforeState = classifiedRows
    .map(({ id, page, home_page }) => ({ id, page, home_page }))
    .toSorted((left, right) => String(left.id).localeCompare(String(right.id), "en"));

  if (!evaluation.ok) {
    return {
      ok: false,
      stopped: true,
      applied: false,
      releaseId,
      migration: "page-section-owner-xor",
      blockers: evaluation.blockers,
      summary: evaluation.counts,
      expectedAfter: EXPECTED_AFTER,
      beforeState,
      report: [],
      pendingSql: [],
    };
  }

  const plan = buildPatchPlan(classifiedRows);
  const report = [];
  if (apply) {
    // The field MUST become nullable BEFORE row patches: Directus rejects
    // page=null on a required field (FAILED_VALIDATION), so patching rows
    // first fails on the very first dual-owner row.
    await client.request(`/fields/${OWNER_COLLECTION}/page`, {
      method: "PATCH",
      body: nullableFieldPatch(),
    });
    report.push({
      action: "update field meta",
      field: `${OWNER_COLLECTION}.page`,
      change: "required=false, is_nullable=true",
      releaseId,
    });
    for (const patch of plan.patches) {
      if (patch.noop) {
        report.push({ action: "verify row owner", id: patch.id, owner: patch.owner });
        continue;
      }
      await client.request(`/items/${OWNER_COLLECTION}/${encodeURIComponent(patch.id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch.patch),
      });
      report.push({
        action: "patch row owner",
        id: patch.id,
        owner: patch.owner,
        patch: patch.patch,
        releaseId,
      });
    }
  } else {
    for (const patch of plan.patches) {
      report.push({
        action: patch.noop ? "verify row owner" : "patch row owner",
        id: patch.id,
        owner: patch.owner,
        ...(patch.noop ? {} : { patch: patch.patch }),
      });
    }
    report.push({
      action: "update field meta",
      field: `${OWNER_COLLECTION}.page`,
      change: "required=false, is_nullable=true",
    });
  }

  const pendingSql = [
    {
      action: "execute CHECK constraint SQL (operator, psql, same maintenance window)",
      file: path.resolve(import.meta.dirname, "../..", UP_SQL_RELATIVE_PATH),
    },
  ];

  return {
    ok: true,
    stopped: false,
    applied: apply,
    releaseId,
    migration: "page-section-owner-xor",
    blockers: [],
    summary: evaluation.counts,
    expectedAfter: EXPECTED_AFTER,
    beforeState,
    plan,
    report,
    pendingSql: apply ? pendingSql : [],
  };
}

/**
 * Rollback path: restore both owner fields on every row from the release
 * packet before-state, then make `page_sections.page` required again. The
 * down SQL must have dropped the CHECK constraint beforehand.
 */
export async function runRestore(client, beforeState, { apply = false } = {}) {
  const rows = beforeState.map(({ id, page, home_page }) => ({ id, page, home_page }));
  const report = [];
  if (apply) {
    for (const row of rows) {
      await client.request(`/items/${OWNER_COLLECTION}/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ page: row.page, home_page: row.home_page }),
      });
      report.push({ action: "restore row owners", id: row.id });
    }
    await client.request(`/fields/${OWNER_COLLECTION}/page`, {
      method: "PATCH",
      body: requiredFieldPatch(),
    });
    report.push({
      action: "update field meta",
      field: `${OWNER_COLLECTION}.page`,
      change: "required=true, is_nullable=false",
    });
  }

  return {
    ok: true,
    applied: apply,
    migration: "page-section-owner-xor-restore",
    restored: rows.length,
    rollbackStatements: buildRollbackStatements(rows),
    report,
  };
}

const argumentValue = (name, args = process.argv.slice(2)) => {
  const prefix = `--${name}=`;
  return args.find((value) => value.startsWith(prefix))?.slice(prefix.length);
};

const parseBeforeState = (content) =>
  content
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const row = JSON.parse(line);
      if (!row?.id || !("page" in row) || !("home_page" in row)) {
        throw new Error("before-state rows must contain id, page and home_page");
      }
      return row;
    });

const writeBeforeStateExclusive = async (directory, rows) => {
  for (const row of rows) assertSafeArtifact(row);
  const filename = path.join(directory, "before-state.ndjson");
  const handle = await open(filename, "wx");
  try {
    await handle.writeFile(
      rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
      "utf8",
    );
  } finally {
    await handle.close();
  }
  return filename;
};

async function main() {
  const args = process.argv.slice(2);
  const restore = args.includes("--restore");
  const client = await DirectusAdminClient.connectFromEnvironment();

  if (restore) {
    const beforeStateFile = argumentValue("before-state", args);
    if (!beforeStateFile) {
      throw new Error("--restore requires --before-state=<file>");
    }
    const beforeState = parseBeforeState(
      await readFile(beforeStateFile, "utf8"),
    );
    const result = await runRestore(client, beforeState, { apply: args.includes("--apply") });
    console.log(`${result.applied ? "Restored" : "Planned restore of"} ${result.restored} page_sections rows`);
    for (const statement of result.rollbackStatements.slice(0, 3)) {
      console.log(`- ${statement}`);
    }
    if (result.rollbackStatements.length > 3) {
      console.log(`- ... ${result.rollbackStatements.length - 3} more`);
    }
    if (!result.applied) {
      console.log("Re-run with --apply to write the restore.");
    }
    return;
  }

  const apply = args.includes("--apply");
  const releaseId = argumentValue("release-id", args) ?? null;
  const outputDirectory = argumentValue("output", args) ?? null;
  const dryRun = !apply;

  const result = await runOwnerMigration(client, { apply, releaseId });

  if (outputDirectory) {
    const repositoryRoot = path.resolve(import.meta.dirname, "../..");
    const directory = await assertArtifactDirectory(outputDirectory, {
      repositoryRoot,
      scanExistingFiles: true,
    });
    const { beforeState, ...planArtifact } = result;
    await writeArtifactsExclusive(directory, {
      "page-section-owner-plan.json": planArtifact,
    });
    const beforeStateFilename = await writeBeforeStateExclusive(directory, beforeState);
    console.log(`Wrote page-section-owner plan to ${path.join(directory, "page-section-owner-plan.json")}`);
    console.log(`Wrote before-state to ${beforeStateFilename}`);
  }

  if (result.stopped) {
    console.error(
      `STOP: ${result.blockers.length} blocker(s) prevented the page_sections owner-XOR migration:`,
    );
    for (const blocker of result.blockers) {
      console.error(`- [${blocker.code}] ${blocker.detail ?? JSON.stringify(blocker)}`);
    }
    process.exitCode = 1;
    return;
  }

  const verb = apply ? "Applied" : "Planned";
  console.log(
    `${verb} page_sections owner-XOR migration ` +
      `(${result.summary.dualOwner} -> home-owned, ${result.summary.pageOnly} page-owned, ` +
      `${result.summary.ownerless} ownerless of ${result.summary.total} rows):`,
  );
  for (const entry of result.report) {
    console.log(`- ${entry.action} ${entry.id ?? entry.field ?? ""}`.trimEnd());
  }
  if (apply) {
    for (const step of result.pendingSql) {
      console.log(`PENDING OPERATOR STEP: ${step.action}: ${step.file}`);
    }
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
