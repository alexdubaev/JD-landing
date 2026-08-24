import test from "node:test";
import assert from "node:assert/strict";

import {
  COLLECTION_CONFIG,
  EXPECTED_AFTER,
  MAX_PAGES,
  PAGE_SIZE,
  SAMPLE_SIZE,
  SEO_JSON_COLLECTIONS,
  buildBeforeStateRow,
  buildSeoJson,
  collectSeoJsonState,
  evaluateSeoJsonState,
  hasExistingJsonSeo,
  reconcileSeoJson,
  rollbackSeoJson,
  runSeoJsonMigration,
  scalarFieldNames,
  scalarsSha256,
} from "./migrate-seo-json.mjs";
import { assertSafeArtifact } from "../releases/lib/artifacts.mjs";

const sortById = (items) =>
  [...items].sort((left, right) => String(left.id).localeCompare(String(right.id), "en"));

/**
 * In-memory mock Directus client: collection list, per-collection field lists,
 * singleton OBJECT for /items/home_page, { data } semantics for list GETs
 * (arrays), single-item GETs returning OBJECTS, and PATCHes that mutate the
 * store so a re-run sees the interrupted run's writes. No live Directus is
 * required.
 */
const mockClient = ({
  collections = SEO_JSON_COLLECTIONS.map((name) => ({ collection: name })),
  missingSeoFieldOn = [],
  itemsByCollection = {},
  failOnNthPatch = null,
} = {}) => {
  const store = new Map(
    SEO_JSON_COLLECTIONS.map((name) => [
      name,
      COLLECTION_CONFIG[name].singleton
        ? (itemsByCollection[name] ?? null)
        : sortById(itemsByCollection[name] ?? []),
    ]),
  );
  const requests = [];
  const patches = [];
  let patchCount = 0;
  return {
    requests,
    patches,
    store,
    async request(path, options = {}) {
      const method = options.method ?? "GET";
      requests.push({ path, method, body: options.body });
      if (method === "PATCH") {
        patchCount += 1;
        if (failOnNthPatch === patchCount) {
          throw new Error(`PATCH ${path} failed: HTTP 401 token expired`);
        }
        const [, collection, id] = path.match(/^\/items\/([^/]+)(?:\/([^/?]+))?/) ?? [];
        const body = JSON.parse(options.body);
        patches.push({ path, collection, id: id ?? null, body });
        const config = COLLECTION_CONFIG[collection];
        if (config?.singleton) {
          store.set(collection, { ...store.get(collection), ...body });
        } else {
          const rows = store.get(collection) ?? [];
          const index = rows.findIndex((row) => String(row.id) === String(id));
          if (index >= 0) rows[index] = { ...rows[index], ...body };
        }
        return {};
      }
      if (path === "/collections") return collections;
      const fieldsMatch = path.match(/^\/fields\/([^/?]+)$/);
      if (fieldsMatch) {
        const name = fieldsMatch[1];
        if (missingSeoFieldOn.includes(name)) {
          return scalarFieldNames(name).map((field) => ({ field }));
        }
        return ["id", "seo", ...scalarFieldNames(name)].map((field) => ({ field }));
      }
      const singleMatch = path.match(/^\/items\/([^/]+)\/([^/?]+)\?/);
      if (singleMatch) {
        const [, collection, id] = singleMatch;
        const rows = store.get(collection);
        if (Array.isArray(rows)) {
          return rows.find((row) => String(row.id) === String(id)) ?? null;
        }
        return rows && String(rows.id) === String(id) ? rows : null;
      }
      const listMatch = path.match(/^\/items\/([^/?]+)\?/);
      if (listMatch) {
        const collection = listMatch[1];
        const params = new URL(path, "https://directus.test").searchParams;
        const config = COLLECTION_CONFIG[collection];
        if (config?.singleton) {
          // Directus quirk: the singleton item GET returns an OBJECT.
          return store.get(collection);
        }
        const rows = store.get(collection) ?? [];
        const page = Number(params.get("page") ?? "1");
        const limit = Number(params.get("limit") ?? String(PAGE_SIZE));
        return rows.slice((page - 1) * limit, page * limit);
      }
      return [];
    },
  };
};

const memoryCheckpoint = () => {
  const lines = [];
  return {
    lines,
    async append(entry) {
      lines.push(entry);
    },
    async close() {},
  };
};

// ---------------------------------------------------------------------------
// Pure mapping (invariants 1, 2, 4)
// ---------------------------------------------------------------------------

test("buildSeoJson maps every scalar into the plugin JSON shape", () => {
  const { json, mapped } = buildSeoJson(
    {
      seo_title: " Заголовок ",
      seo_description: "Описание",
      canonical_url: "https://deere-shop.test/engine",
      og_image: { id: "file-uuid" },
      is_indexable: false,
    },
    "pages",
  );

  assert.deepEqual(json, {
    title: "Заголовок",
    meta_description: "Описание",
    additional_fields: { canonical_url: "https://deere-shop.test/engine" },
    og_image: "file-uuid",
    no_index: true,
  });
  assert.deepEqual(mapped, [
    "seo_title",
    "seo_description",
    "canonical_url",
    "og_image",
    "is_indexable",
  ]);
});

test("buildSeoJson drops empty sources and keeps the JSON default for is_indexable=true", () => {
  assert.equal(
    buildSeoJson(
      {
        seo_title: "",
        seo_description: "   ",
        canonical_url: null,
        og_image: "",
        is_indexable: true,
      },
      "home_page",
    ),
    null,
    "no non-empty source — not a candidate",
  );

  // is_indexable=true is the JSON default (no_index=false) — never written.
  const keepTrue = buildSeoJson({ seo_title: "T", is_indexable: true }, "home_page");
  assert.deepEqual(keepTrue.json, { title: "T" });
  assert.deepEqual(keepTrue.mapped, ["seo_title"]);
});

test("buildSeoJson skips absent mapping keys per collection (articles has no canonical/robots)", () => {
  const { json, mapped } = buildSeoJson(
    {
      seo_title: "Статья",
      seo_description: "Описание",
      og_image: "raw-uuid",
      canonical_url: "https://ignored.test",
      is_indexable: false,
    },
    "articles",
  );

  assert.deepEqual(json, {
    title: "Статья",
    meta_description: "Описание",
    og_image: "raw-uuid",
  });
  assert.deepEqual(mapped, ["seo_title", "seo_description", "og_image"]);
});

test("hasExistingJsonSeo treats every non-null value as existing JSON", () => {
  assert.equal(hasExistingJsonSeo(null), false);
  assert.equal(hasExistingJsonSeo(undefined), false);
  assert.equal(hasExistingJsonSeo({}), true, "an empty object is still existing JSON");
  assert.equal(hasExistingJsonSeo("garbage string"), true);
  assert.equal(hasExistingJsonSeo([1, 2]), true);
  assert.equal(hasExistingJsonSeo(42), true);
});

test("scalarsSha256 is order-insensitive over the scalar snapshot", () => {
  const left = { seo_title: "A", seo_description: "B", og_image: null, is_indexable: true };
  const right = { is_indexable: true, og_image: null, seo_description: "B", seo_title: "A" };
  assert.equal(scalarsSha256(left, "categories"), scalarsSha256(right, "categories"));
  assert.notEqual(
    scalarsSha256({ ...left, seo_title: "A " }, "categories"),
    scalarsSha256(left, "categories"),
  );
});

// ---------------------------------------------------------------------------
// Dry run (invariants 1, 2, 5) + preconditions
// ---------------------------------------------------------------------------

const fixtures = () => ({
  home_page: {
    id: "home-1",
    seo: null,
    seo_title: "Главная",
    seo_description: "Описание главной",
    canonical_url: "/",
    og_image: "home-og",
    is_indexable: true,
  },
  pages: [
    // candidate: title + og_image object form
    { id: "page-1", seo: null, seo_title: "Доставка", seo_description: null, canonical_url: null, og_image: { id: "og-1" }, is_indexable: false },
    // candidate: indexability only
    { id: "page-2", seo: null, seo_title: null, seo_description: null, canonical_url: null, og_image: null, is_indexable: false },
    // not a candidate: everything empty
    { id: "page-3", seo: null, seo_title: null, seo_description: "", canonical_url: null, og_image: null, is_indexable: true },
    // skipped: seo JSON already exists
    { id: "page-4", seo: { title: "existing" }, seo_title: "Дубль", seo_description: null, canonical_url: null, og_image: null, is_indexable: true },
    // skipped: corrupted seo string is still existing JSON
    { id: "page-5", seo: "garbage", seo_title: "Повреждено", seo_description: null, canonical_url: null, og_image: null, is_indexable: true },
  ],
  categories: [
    { id: "cat-1", seo: null, seo_title: "Муфты", seo_description: "Описание", og_image: "cat-og", is_indexable: true },
  ],
  products: [
    { id: "prod-1", seo: null, seo_title: "Насос", seo_description: null, og_image: null, is_indexable: true },
  ],
  articles: [
    { id: "art-1", seo: null, seo_title: null, seo_description: "Описание статьи", og_image: null },
  ],
});

test("dry run is the default, performs no writes and reports per-collection counts", async () => {
  const client = mockClient({ itemsByCollection: fixtures() });
  const result = await runSeoJsonMigration(client);

  assert.equal(result.ok, true);
  assert.equal(result.applied, false);
  assert.deepEqual(
    client.requests.map(({ method }) => method).filter((method) => method !== "GET"),
    [],
    "no writes in dry-run mode",
  );

  const pages = result.summary.collections.pages;
  assert.equal(pages.scanned, 5);
  assert.equal(pages.candidates, 2);
  assert.equal(pages.skippedJsonExists, 2);
  assert.equal(pages.notCandidates, 1);
  assert.equal(result.summary.collections.home_page.candidates, 1);
  assert.equal(result.summary.collections.categories.candidates, 1);
  assert.equal(result.summary.collections.products.candidates, 1);
  assert.equal(result.summary.collections.articles.candidates, 1);
  assert.equal(result.summary.totalCandidates, 6);
  assert.equal(result.summary.totalSkippedJsonExists, 2);

  // Per-field mapping counts.
  assert.deepEqual(pages.mappingCounts, { seo_title: 1, og_image: 1, is_indexable: 2 });
  assert.deepEqual(
    result.summary.collections.home_page.mappingCounts,
    { seo_title: 1, seo_description: 1, canonical_url: 1, og_image: 1 },
  );

  // Sampled diff: first SAMPLE_SIZE candidates with before scalars + proposed JSON.
  assert.equal(result.sampleDiff.length, SAMPLE_SIZE);
  assert.equal(result.sampleDiff[0].collection, "home_page");
  assert.equal(result.sampleDiff[0].proposed.canonical ? "x" : "y", "y");
  assert.deepEqual(result.sampleDiff[0].proposed, {
    title: "Главная",
    meta_description: "Описание главной",
    additional_fields: { canonical_url: "/" },
    og_image: "home-og",
  });
  assert.equal(result.sampleDiff[0].scalars.seo_title, "Главная");
});

test("the before-state rows and the plan artifact are safe to store", async () => {
  const client = mockClient({ itemsByCollection: fixtures() });
  const result = await runSeoJsonMigration(client, {
    apply: true,
    releaseId: "R11",
  });

  for (const row of result.beforeState) assert.doesNotThrow(() => assertSafeArtifact(row));
  const { beforeState, ...planArtifact } = result;
  assert.equal(beforeState.length, 6);
  assert.doesNotThrow(() => assertSafeArtifact(planArtifact));
  assert.deepEqual(EXPECTED_AFTER, { candidates: 0, patches: 0 });
});

test("STOPS when a collection is missing", async () => {
  const client = mockClient({
    collections: SEO_JSON_COLLECTIONS.filter((name) => name !== "articles").map(
      (collection) => ({ collection }),
    ),
    itemsByCollection: fixtures(),
  });
  const result = await runSeoJsonMigration(client, { apply: true, releaseId: "R11" });

  assert.equal(result.stopped, true);
  assert.ok(
    result.blockers.some(
      (blocker) => blocker.code === "missing-collection" && blocker.detail.includes("articles"),
    ),
  );
  assert.equal(client.patches.length, 0);
});

test("STOPS before any write when the additive seo field is not applied yet", async () => {
  const client = mockClient({
    missingSeoFieldOn: ["products"],
    itemsByCollection: fixtures(),
  });
  const result = await runSeoJsonMigration(client, { apply: true, releaseId: "R11" });

  assert.equal(result.stopped, true);
  assert.ok(
    result.blockers.some(
      (blocker) =>
        blocker.code === "missing-seo-field" && blocker.detail.includes("products.seo"),
    ),
  );
  assert.equal(client.patches.length, 0);

  // Read-only state evaluation stays clean for a fully applied schema.
  const state = await collectSeoJsonState(mockClient({ itemsByCollection: fixtures() }));
  assert.deepEqual(evaluateSeoJsonState(state), { ok: true, blockers: [] });
});

test("apply requires a release id", async () => {
  const client = mockClient({ itemsByCollection: fixtures() });
  await assert.rejects(
    () => runSeoJsonMigration(client, { apply: true }),
    /release-id/i,
  );
});

// ---------------------------------------------------------------------------
// Apply (invariants 3, 6) + write-set audit
// ---------------------------------------------------------------------------

test("apply patches ONLY the seo key of null-seo candidates (never clears scalars)", async () => {
  const client = mockClient({ itemsByCollection: fixtures() });
  const result = await runSeoJsonMigration(client, {
    apply: true,
    releaseId: "R11-2026-08-18",
  });

  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.equal(result.summary.totalPatches, 6);
  assert.equal(client.patches.length, 6);

  // Write-set audit: every PATCH body carries ONLY the seo key.
  for (const { collection, id, body } of client.patches) {
    assert.deepEqual(Object.keys(body), ["seo"], `unexpected write keys on ${collection}/${id}`);
  }
  // The singleton is patched without an id segment; list items with one.
  assert.ok(client.patches.some(({ collection, id }) => collection === "home_page" && id === null));
  assert.ok(client.patches.every(({ path }) => !/\/files|\/fields|\/collections/.test(path)));
  for (const { method } of client.requests) {
    assert.notEqual(method, "DELETE", "the migration never deletes");
  }

  // The scalar sources are untouched in the mutated store.
  const pages = client.store.get("pages");
  assert.equal(pages.find(({ id }) => id === "page-1").seo_title, "Доставка");
  // page-4 was NEVER patched — its pre-existing JSON is still there verbatim.
  assert.deepEqual(pages.find(({ id }) => id === "page-4").seo, { title: "existing" });
  assert.deepEqual(pages.find(({ id }) => id === "page-1").seo, {
    title: "Доставка",
    og_image: "og-1",
    no_index: true,
  });

  // Before-state rows: exactly the candidates, prior seo always null.
  assert.deepEqual(
    result.beforeState.map(({ collection, id }) => `${collection}:${id}`),
    [
      "home_page:home-1",
      "pages:page-1",
      "pages:page-2",
      "categories:cat-1",
      "products:prod-1",
      "articles:art-1",
    ],
  );
  assert.ok(result.beforeState.every(({ prior_seo }) => prior_seo === null));
  assert.ok(
    result.beforeState.every((row) => typeof row.scalars_sha256 === "string"),
  );
});

test("a full re-run after completion is a clean no-op (all skips, zero patches)", async () => {
  const store = fixtures();
  const first = mockClient({ itemsByCollection: store });
  const applied = await runSeoJsonMigration(first, { apply: true, releaseId: "R11" });
  assert.equal(applied.noop, false);

  // Re-run over the SAME mutated store: every candidate now has JSON
  // (6 patched + 2 pre-existing values = 8 json-exists skips).
  const second = mockClient({ itemsByCollection: Object.fromEntries(first.store) });
  const rerun = await runSeoJsonMigration(second, { apply: true, releaseId: "R11" });

  assert.equal(rerun.ok, true);
  assert.equal(rerun.noop, true);
  assert.equal(rerun.summary.totalCandidates, 0);
  assert.equal(rerun.summary.totalPatches, 0);
  assert.equal(second.patches.length, 0, "zero patches on the second full run");
  assert.equal(rerun.summary.totalSkippedJsonExists, 8);
});

test("an HTTP 401 mid-apply fails fast with a resumable progress message", async () => {
  const client = mockClient({ itemsByCollection: fixtures(), failOnNthPatch: 3 });
  const checkpoint = memoryCheckpoint();

  await assert.rejects(
    () =>
      runSeoJsonMigration(client, {
        apply: true,
        releaseId: "R11-401",
        checkpointWriter: checkpoint,
      }),
    (error) => {
      assert.match(error.message, /HTTP 401/);
      assert.match(error.message, /2\/6 candidate patch/);
      assert.match(error.message, /Re-run the same command/);
      return true;
    },
  );

  // The first two patches landed and were checkpointed; the run stopped.
  assert.equal(client.patches.length, 2);
  assert.deepEqual(checkpoint.lines, [
    { collection: "home_page", id: "home-1" },
    { collection: "pages", id: "page-1" },
  ]);

  // A re-run over the mutated store resumes: the patched items are skipped
  // because their seo is now non-null, the rest are patched.
  const resumed = mockClient({ itemsByCollection: Object.fromEntries(client.store) });
  const result = await runSeoJsonMigration(resumed, {
    apply: true,
    releaseId: "R11-401",
  });
  assert.equal(result.summary.totalPatches, 4);
  assert.equal(result.summary.totalSkippedJsonExists, 4);
});

test("a checkpoint-seeded re-run skips the recorded items without writing", async () => {
  const client = mockClient({ itemsByCollection: fixtures() });
  const checkpoint = memoryCheckpoint();
  const result = await runSeoJsonMigration(client, {
    apply: true,
    releaseId: "R11",
    checkpoint: new Set(["home_page:home-1", "pages:page-1"]),
    checkpointWriter: checkpoint,
  });

  // The two seeded items count as done but produce no write and no line.
  assert.equal(result.summary.totalPatches, 6);
  assert.equal(client.patches.length, 4);
  assert.equal(checkpoint.lines.length, 4);
});

test("pages through the items in bounded batches with explicit fields (never limit=-1)", async () => {
  const products = Array.from({ length: PAGE_SIZE + 1 }, (_, index) => ({
    id: `p${String(index + 1).padStart(4, "0")}`,
    seo: null,
    seo_title: `Товар ${index}`,
    seo_description: null,
    og_image: null,
    is_indexable: true,
  }));
  const client = mockClient({ itemsByCollection: { products } });
  const result = await runSeoJsonMigration(client);

  assert.equal(result.ok, true);
  assert.equal(result.summary.collections.products.scanned, PAGE_SIZE + 1);
  assert.equal(result.summary.collections.products.candidates, PAGE_SIZE + 1);

  const listRequests = client.requests.filter(
    ({ path }) => path.startsWith("/items/products?"),
  );
  assert.ok(listRequests.length >= 2, "the overflow page is fetched");
  for (const { path } of listRequests) {
    const params = new URL(path, "https://directus.test").searchParams;
    assert.equal(params.get("limit"), String(PAGE_SIZE));
    assert.notEqual(params.get("limit"), "-1");
    assert.equal(params.get("sort"), "id");
    assert.equal(
      params.get("fields"),
      "id,seo,seo_title,seo_description,og_image,is_indexable",
    );
  }
  assert.ok(MAX_PAGES >= 130, "the full 12 971-product catalog fits within the page guard");
});

// ---------------------------------------------------------------------------
// Reconcile (invariant 8)
// ---------------------------------------------------------------------------

test("reconcile verifies seo presence, JSON shape and unchanged scalars", async () => {
  const client = mockClient({ itemsByCollection: fixtures() });
  const applied = await runSeoJsonMigration(client, { apply: true, releaseId: "R11" });

  const ok = await reconcileSeoJson(client, { beforeState: applied.beforeState });
  assert.equal(ok.ok, true);
  assert.equal(ok.summary.items, 6);
  assert.equal(ok.summary.verified, 6);
  assert.deepEqual(ok.violations, []);
});

test("reconcile reports null seo, unparseable seo, changed scalars and missing items", async () => {
  const client = mockClient({ itemsByCollection: fixtures() });
  const applied = await runSeoJsonMigration(client, { apply: true, releaseId: "R11" });
  const rows = applied.beforeState;

  // page-1: seo flipped back to null (a failed patch).
  const pages = client.store.get("pages");
  pages.find(({ id }) => id === "page-1").seo = null;
  // cat-1: corrupted JSON string that does not parse.
  client.store.get("categories").find(({ id }) => id === "cat-1").seo = "not-json";
  // prod-1: scalar edited after the migration.
  client.store.get("products").find(({ id }) => id === "prod-1").seo_title = "Изменён";
  // art-1: item deleted.
  client.store.set("articles", []);

  const result = await reconcileSeoJson(client, { beforeState: rows });
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.violations.map(({ code }) => code).sort(),
    ["missing-item", "scalars-changed", "seo-null", "seo-unparseable"],
  );
  assert.equal(result.summary.verified, 2, "home_page and pages/page-2 stay clean");
});

test("reconcile accepts a JSON-string seo that parses to the plugin object", async () => {
  const client = mockClient({ itemsByCollection: fixtures() });
  const applied = await runSeoJsonMigration(client, { apply: true, releaseId: "R11" });
  client.store.get("pages").find(({ id }) => id === "page-1").seo = '{"title":"Доставка"}';

  const result = await reconcileSeoJson(client, { beforeState: applied.beforeState });
  assert.equal(result.ok, true);
  assert.equal(result.summary.verified, 6);
});

// ---------------------------------------------------------------------------
// Rollback (invariant 7)
// ---------------------------------------------------------------------------

test("rollback restores the exact prior seo for exactly the before-state items", async () => {
  const client = mockClient({ itemsByCollection: fixtures() });
  const applied = await runSeoJsonMigration(client, { apply: true, releaseId: "R11" });
  assert.equal(client.patches.length, 6);

  const result = await rollbackSeoJson(client, { beforeState: applied.beforeState });

  assert.equal(result.ok, true);
  assert.equal(result.summary.patches, 6);
  assert.equal(result.summary.verified, 6);

  // Write-set audit: rollback bodies carry ONLY the seo key (null).
  for (const { body } of client.patches.slice(6)) {
    assert.deepEqual(body, { seo: null });
  }

  // Verified by re-fetch: seo is null again, scalars untouched.
  for (const rows of [client.store.get("pages")]) {
    assert.equal(rows.find(({ id }) => id === "page-1").seo, null);
    assert.equal(rows.find(({ id }) => id === "page-1").seo_title, "Доставка");
    assert.deepEqual(rows.find(({ id }) => id === "page-4").seo, { title: "existing" });
  }
  assert.equal(client.store.get("home_page").seo, null);
});

test("rollback flags a restore that did not stick", async () => {
  const client = mockClient({ itemsByCollection: fixtures() });
  const applied = await runSeoJsonMigration(client, { apply: true, releaseId: "R11" });

  // Sabotage: a concurrent edit re-fills seo between the restore and the
  // verification re-fetch is simulated by re-patching inside the store.
  const original = client.request.bind(client);
  let rollbackStarted = false;
  client.request = async (path, options = {}) => {
    const result = await original(path, options);
    if (!rollbackStarted && options.method === "PATCH" && path.startsWith("/items/pages/page-1")) {
      rollbackStarted = true;
      const pages = client.store.get("pages");
      pages.find(({ id }) => id === "page-1").seo = { title: "raced" };
    }
    return result;
  };

  const result = await rollbackSeoJson(client, { beforeState: applied.beforeState });
  assert.equal(result.ok, false);
  assert.ok(
    result.violations.some(({ code }) => code === "restore-mismatch"),
  );
});

test("buildBeforeStateRow captures the prior value and scalar hash", () => {
  const row = buildBeforeStateRow(
    { id: "x", seo: null, seo_title: "T", seo_description: null, og_image: null },
    "articles",
  );
  assert.equal(row.collection, "articles");
  assert.equal(row.id, "x");
  assert.equal(row.prior_seo, null);
  assert.equal(row.scalars_sha256, scalarsSha256(
    { id: "x", seo: null, seo_title: "T", seo_description: null, og_image: null },
    "articles",
  ));
});
