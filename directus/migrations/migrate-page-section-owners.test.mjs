import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  EXPECTED_OWNER_SPLIT,
  OWNER_XOR_CHECK_NAME,
  buildBeforeState,
  buildPatchPlan,
  buildRollbackStatements,
  classifyRow,
  runOwnerMigration,
  runRestore,
} from "./migrate-page-section-owners.mjs";

const PAGE_ID = "d0a41e0a-1f1e-4f2f-9db5-000000000001";
const OTHER_PAGE_ID = "d0a41e0a-1f1e-4f2f-9db5-000000000002";
const HOME_PAGE_ID = "c5f2ea7b-4546-4b51-88d2-06402831761a";

/**
 * Builds the canonical 13-row production shape: 11 dual-owner rows plus
 * 2 page-only rows. One row of each owner kind uses the expanded Directus
 * relational object form to exercise id extraction.
 */
const productionSections = () => [
  ...Array.from({ length: 11 }, (_, index) => ({
    id: `section-dual-${String(index + 1).padStart(2, "0")}`,
    page: index === 0 ? { id: PAGE_ID } : PAGE_ID,
    home_page: index === 1 ? { id: HOME_PAGE_ID } : HOME_PAGE_ID,
  })),
  {
    id: "section-page-01",
    page: OTHER_PAGE_ID,
    home_page: null,
  },
  {
    id: "section-page-02",
    page: { id: OTHER_PAGE_ID },
    home_page: null,
  },
];

/**
 * Mock Directus client serving the page_sections rows, the pages FK targets
 * and the home_page singleton. No live Directus is required.
 */
const mockClient = ({ sections = [], pages = [], homePage = { id: HOME_PAGE_ID } } = {}) => {
  const requests = [];
  return {
    requests,
    async request(path, options = {}) {
      const method = options.method ?? "GET";
      requests.push({ path, method, body: options.body });
      if (method !== "GET") return null;
      if (path.startsWith("/items/page_sections?")) return sections;
      if (path.startsWith("/items/pages?")) return pages;
      if (path.startsWith("/items/home_page")) return homePage;
      return [];
    },
  };
};

const mockClientForSections = (sections) =>
  mockClient({
    sections,
    pages: [{ id: PAGE_ID }, { id: OTHER_PAGE_ID }],
  });

test("targets exactly the 13-row owner split of the production page_sections", () => {
  assert.deepEqual(EXPECTED_OWNER_SPLIT, { total: 13, dualOwner: 11, pageOnly: 2 });
});

test("classifyRow distinguishes dual, home, page and ownerless rows", () => {
  assert.equal(classifyRow({ id: "a", page: PAGE_ID, home_page: HOME_PAGE_ID }).ownerState, "dual");
  assert.equal(classifyRow({ id: "b", page: null, home_page: HOME_PAGE_ID }).ownerState, "home");
  assert.equal(classifyRow({ id: "c", page: PAGE_ID, home_page: null }).ownerState, "page");
  assert.equal(classifyRow({ id: "d", page: null, home_page: null }).ownerState, "ownerless");
  assert.equal(
    classifyRow({ id: "e", page: { id: PAGE_ID }, home_page: { id: HOME_PAGE_ID } }).ownerState,
    "dual",
  );
});

test("plan patches every dual-owner row to home-owned by nulling page only", () => {
  const plan = buildPatchPlan(productionSections());

  assert.equal(plan.patches.length, 13);
  const homePatches = plan.patches.filter((patch) => patch.owner === "home");
  assert.equal(homePatches.length, 11);
  for (const patch of homePatches) {
    assert.deepEqual(patch.patch, { page: null });
    assert.equal(patch.noop, false);
  }
});

test("plan keeps the two page-only rows page-owned as verified no-ops", () => {
  const plan = buildPatchPlan(productionSections());

  const pagePatches = plan.patches.filter((patch) => patch.owner === "page");
  assert.equal(pagePatches.length, 2);
  for (const patch of pagePatches) {
    assert.deepEqual(patch.patch, { home_page: null });
    assert.equal(patch.noop, true, "home_page is already null; nothing to write");
  }
  assert.equal(plan.patchWrites, 11);
  assert.equal(plan.noopPatches, 2);
});

test("before-state records id, page and home_page for every row sorted by id", () => {
  const beforeState = buildBeforeState(productionSections());

  assert.equal(beforeState.length, 13);
  assert.deepEqual(
    beforeState.map(({ id }) => id),
    [...beforeState.map(({ id }) => id)].sort((left, right) => left.localeCompare(right, "en")),
  );
  for (const row of beforeState) {
    assert.deepEqual(Object.keys(row).sort(), ["home_page", "id", "page"]);
  }
  assert.equal(beforeState[0].page, PAGE_ID);
  assert.equal(beforeState[0].home_page, HOME_PAGE_ID);
});

test("dry run reads the owner table and performs no writes", async () => {
  const client = mockClientForSections(productionSections());
  const result = await runOwnerMigration(client);

  assert.equal(result.ok, true);
  assert.equal(result.stopped, false);
  assert.equal(result.applied, false);
  assert.equal(result.summary.total, 13);
  assert.equal(result.summary.dualOwner, 11);
  assert.equal(result.summary.pageOnly, 2);
  assert.equal(result.summary.ownerless, 0);
  assert.deepEqual(result.expectedAfter, {
    total: 13,
    homeOwned: 11,
    pageOwned: 2,
    invalid: 0,
  });
  assert.equal(
    client.requests.some((entry) => entry.method !== "GET"),
    false,
    "no writes in dry-run mode",
  );
});

test("apply without --release-id is refused", async () => {
  const client = mockClientForSections(productionSections());
  await assert.rejects(
    () => runOwnerMigration(client, { apply: true }),
    /release-id/i,
  );
});

test("apply makes the page field nullable FIRST, then patches rows, then requires the CHECK SQL", async () => {
  const client = mockClientForSections(productionSections());
  const result = await runOwnerMigration(client, {
    apply: true,
    releaseId: "R4-2026-08-14",
  });

  assert.equal(result.applied, true);
  assert.equal(result.releaseId, "R4-2026-08-14");

  const rowPatches = client.requests.filter(
    (entry) =>
      entry.method === "PATCH" && entry.path.startsWith("/items/page_sections/"),
  );
  assert.equal(rowPatches.length, 11, "only the dual-owner rows are written");
  for (const entry of rowPatches) {
    assert.deepEqual(JSON.parse(entry.body), { page: null });
  }

  const fieldPatch = client.requests.find(
    (entry) => entry.method === "PATCH" && entry.path === "/fields/page_sections/page",
  );
  assert.ok(fieldPatch, "updates the page field meta");
  const payload = JSON.parse(fieldPatch.body);
  assert.equal(payload.meta.required, false);
  assert.equal(payload.schema.is_nullable, true);

  const fieldPatchIndex = client.requests.indexOf(fieldPatch);
  for (const entry of rowPatches) {
    assert.ok(
      fieldPatchIndex < client.requests.indexOf(entry),
      "the field must become nullable BEFORE any row patch (production R6 lesson: page=null on a required field is rejected with FAILED_VALIDATION)",
    );
  }

  assert.equal(result.pendingSql.length, 1);
  assert.match(result.pendingSql[0].file, /page-section-owner-xor-up\.sql$/);
  assert.equal(client.requests.filter((entry) => entry.method !== "GET").length, 12);
});

test("STOPS with no writes when a row has no owner at all", async () => {
  const sections = productionSections();
  sections.push({ id: "section-ownerless", page: null, home_page: null });
  sections.splice(0, 1);
  const client = mockClientForSections(sections);
  const result = await runOwnerMigration(client, { apply: true, releaseId: "R4" });

  assert.equal(result.ok, false);
  assert.equal(result.stopped, true);
  assert.equal(result.applied, false);
  assert.ok(result.blockers.some((blocker) => blocker.code === "ownerless-row"));
  assert.equal(
    client.requests.some((entry) => entry.method !== "GET"),
    false,
    "stopped before any write",
  );
});

test("STOPS when the total row count differs from 13", async () => {
  const sections = productionSections();
  sections.pop();
  const client = mockClientForSections(sections);
  const result = await runOwnerMigration(client, { apply: true, releaseId: "R4" });

  assert.equal(result.stopped, true);
  const blocker = result.blockers.find(
    (entry) => entry.code === "unexpected-total",
  );
  assert.ok(blocker);
  assert.equal(blocker.actual, 12);
  assert.equal(blocker.expected, 13);
});

test("STOPS when the dual/page split is not the expected 11+2", async () => {
  const sections = productionSections();
  // Turn one page-only row into a dual-owner row: 12 dual + 1 page-only.
  sections.find(({ id }) => id === "section-page-01").home_page = HOME_PAGE_ID;
  const client = mockClientForSections(sections);
  const result = await runOwnerMigration(client, { apply: true, releaseId: "R4" });

  assert.equal(result.stopped, true);
  const blocker = result.blockers.find(
    (entry) => entry.code === "unexpected-owner-split",
  );
  assert.ok(blocker);
  assert.deepEqual(blocker.actual, { dualOwner: 12, pageOnly: 1, homeOwned: 0 });
  assert.deepEqual(blocker.expected, EXPECTED_OWNER_SPLIT);
});

test("STOPS when a page FK target does not exist", async () => {
  const sections = productionSections();
  sections[0].page = "00000000-0000-0000-0000-00000000dead";
  const client = mockClientForSections(sections);
  const result = await runOwnerMigration(client, { apply: true, releaseId: "R4" });

  assert.equal(result.stopped, true);
  const blocker = result.blockers.find((entry) => entry.code === "missing-fk-target");
  assert.ok(blocker);
  assert.equal(blocker.field, "page");
  assert.equal(
    client.requests.some((entry) => entry.method !== "GET"),
    false,
  );
});

test("STOPS when a home_page FK target does not match the singleton", async () => {
  const sections = productionSections();
  sections[0].home_page = "00000000-0000-0000-0000-00000000beef";
  const client = mockClientForSections(sections);
  const result = await runOwnerMigration(client, { apply: true, releaseId: "R4" });

  assert.equal(result.stopped, true);
  const blocker = result.blockers.find((entry) => entry.code === "missing-fk-target");
  assert.ok(blocker);
  assert.equal(blocker.field, "home_page");
});

test("rollback statements restore both owner fields for every before-state row", () => {
  const beforeState = buildBeforeState(productionSections());
  const statements = buildRollbackStatements(beforeState);

  assert.equal(statements.length, 13);
  assert.ok(
    statements.every((statement) => statement.startsWith("UPDATE page_sections SET ")),
  );
  const first = beforeState.find(({ id }) => id === "section-dual-01");
  assert.ok(
    statements.some((statement) =>
      statement.includes(`WHERE id = '${first.id}'`) &&
      statement.includes(`page = '${PAGE_ID}'`) &&
      statement.includes(`home_page = '${HOME_PAGE_ID}'`),
    ),
  );
  const pageOnly = beforeState.find(({ id }) => id === "section-page-01");
  assert.ok(
    statements.some((statement) =>
      statement.includes(`WHERE id = '${pageOnly.id}'`) &&
      statement.includes("home_page = NULL"),
    ),
  );
});

test("restore rewrites every row from before-state before making page required again", async () => {
  const client = mockClientForSections([]);
  const beforeState = buildBeforeState(productionSections());
  const result = await runRestore(client, beforeState, { apply: true });

  assert.equal(result.applied, true);
  const rowPatches = client.requests.filter(
    (entry) => entry.method === "PATCH" && entry.path.startsWith("/items/page_sections/"),
  );
  assert.equal(rowPatches.length, 13);
  const dual = beforeState.find(({ id }) => id === "section-dual-01");
  assert.deepEqual(JSON.parse(
    rowPatches.find((entry) => entry.path.endsWith(dual.id)).body,
  ), { page: PAGE_ID, home_page: HOME_PAGE_ID });

  const fieldPatch = client.requests.find(
    (entry) => entry.method === "PATCH" && entry.path === "/fields/page_sections/page",
  );
  assert.ok(fieldPatch, "restores the required field meta");
  const payload = JSON.parse(fieldPatch.body);
  assert.equal(payload.meta.required, true);
  assert.equal(payload.schema.is_nullable, false);
  for (const entry of rowPatches) {
    assert.ok(
      client.requests.indexOf(entry) < client.requests.indexOf(fieldPatch),
      "rows are restored before the field becomes required again",
    );
  }
});

test("the up SQL enforces exactly-one-owner with a named CHECK constraint", async () => {
  const sql = await readFile(
    new URL("./sql/page-section-owner-xor-up.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /CHECK\s*\(\s*num_nonnulls\s*\(\s*page\s*,\s*home_page\s*\)\s*=\s*1\s*\)/i);
  assert.ok(sql.includes(OWNER_XOR_CHECK_NAME));
  assert.match(sql, /DROP CONSTRAINT IF EXISTS/i);
});

test("the down SQL drops the CHECK constraint and restores both fields from before-state", async () => {
  const sql = await readFile(
    new URL("./sql/page-section-owner-xor-down.sql", import.meta.url),
    "utf8",
  );

  assert.match(
    sql,
    new RegExp(
      `ALTER TABLE\\s+page_sections\\s+DROP CONSTRAINT IF EXISTS\\s+${OWNER_XOR_CHECK_NAME};`,
    ),
  );
  assert.match(sql, /before-state\.ndjson/i);
  assert.match(sql, /page-section-owner-plan\.json/i);
});

test("package.json exposes the migrations:page-section-xor script", async () => {
  const packageJson = JSON.parse(await readFile(
    new URL("../package.json", import.meta.url),
    "utf8",
  ));
  assert.equal(
    packageJson.scripts["migrations:page-section-xor"],
    "node migrations/migrate-page-section-owners.mjs",
  );
});
