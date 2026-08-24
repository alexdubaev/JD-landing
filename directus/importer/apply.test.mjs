import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { PROFILE_NAMES, getProfile } from "./profiles.mjs";
import { normalizeRow } from "./normalize.mjs";
import { buildInputManifest } from "./manifest.mjs";
import {
  PAGE_SIZE,
  assertCreatePayloadAllowed,
  assertPatchWithinAllowlist,
  idempotencyKeyFor,
  runImportApply,
} from "./apply.mjs";
import { assertSafeArtifact } from "../releases/lib/artifacts.mjs";
import { createMockDirectus, MOCK_PRODUCT_FIELDS, mockProduct } from "./mock-directus.mjs";

const operations = getProfile("operations-default");

const manifestFor = (rowCount, profileName = "operations-default") =>
  buildInputManifest({
    profileName,
    sha256: "f".repeat(64),
    bytes: rowCount * 10,
    rowCount,
    createdAt: "2026-08-17T00:00:00.000Z",
  });

const normalized = (rows) => rows.map((row, index) => normalizeRow(row, index));

const run = (client, overrides = {}) =>
  runImportApply(client, {
    profile: operations,
    manifest: manifestFor(1),
    normalizedRows: normalized([{ sku: "SKU-P1", price: 1111 }]),
    retryDelayMs: 0,
    ...overrides,
  });

test("dry run is the default and performs no writes", async () => {
  const client = createMockDirectus({ products: [mockProduct("p1")] });
  const result = await run(client, {
    normalizedRows: normalized([{ sku: "SKU-P1", price: 4321 }]),
  });

  assert.equal(result.ok, true);
  assert.equal(result.applied, false);
  assert.deepEqual(
    client.requests.map(({ method }) => method).filter((m) => m !== "GET"),
    [],
    "no writes in dry-run mode",
  );
  assert.equal(result.summary.rows.patch, 1, "the dry run still reports the plan");
  assert.equal(result.summary.writes.patches, 0);
});

test("apply requires a release id", async () => {
  const client = createMockDirectus({ products: [mockProduct("p1")] });
  await assert.rejects(
    () => run(client, { apply: true }),
    /release-id/s,
  );
  assert.equal(client.writes.length, 0);
});

test("INVARIANT 2: every PATCH payload stays within the profile allowlist (all profiles)", async () => {
  const changedValue = {
    price: 1234.5,
    price_status: "on_request",
    availability_status: "in_stock",
    delivery_status: "2-4 days",
    source_name: "synthetic-feed",
    source_url: "https://example.test/feed",
    verified_at: "2026-08-17",
    weight: 12.5,
    title: "Synthetic new title",
    short_description: "synthetic short",
    full_description: "synthetic full",
    image_alt: "synthetic alt",
    mpn: "SYN-MPN-1",
    main_image: "file-9999",
    gallery: ["file-9999"],
  };

  for (const name of PROFILE_NAMES) {
    const profile = getProfile(name);
    const client = createMockDirectus({
      products: [mockProduct("p1", { sku: "SKU-P1", sku_normalized: "SKUP1" })],
      productFields: [...new Set([...MOCK_PRODUCT_FIELDS, ...profile.fields])],
    });
    const row = { sku: "SKU-P1" };
    for (const field of profile.fields) row[field] = changedValue[field];

    const result = await runImportApply(client, {
      profile,
      manifest: manifestFor(1, name),
      normalizedRows: normalized([row]),
      apply: true,
      releaseId: "R9-allowlist",
      approvalRef: profile.optIn ? "APPROVAL-INVARIANT-2" : null,
      retryDelayMs: 0,
    });
    assert.equal(result.ok, true, `${name} apply must succeed`);
    assert.ok(client.writes.length >= 1, `${name} must write`);

    for (const write of client.writes) {
      if (write.method === "PATCH" && write.path.startsWith("/items/products/")) {
        for (const key of Object.keys(write.body)) {
          assert.ok(
            profile.fields.includes(key),
            `${name} PATCH touched "${key}" outside its allowlist`,
          );
        }
      }
      if (write.method === "POST" && write.path === "/items/products") {
        for (const key of Object.keys(write.body)) {
          assert.ok(
            profile.fields.includes(key) || key === "status" || key === "sku",
            `${name} CREATE touched "${key}" outside its allowlist (+status/sku)`,
          );
        }
        assert.equal(write.body.status, "draft");
      }
    }
  }
});

test("PATCH bodies equal the planned minimal diff — never a full payload", async () => {
  const client = createMockDirectus({
    products: [mockProduct("p1", { sku: "SKU-P1", sku_normalized: "SKUP1", price: "1000.00", price_status: "fixed" })],
  });
  const result = await run(client, {
    normalizedRows: normalized([
      { sku: "SKU-P1", price: 1000, price_status: "on_request" },
    ]),
    apply: true,
    releaseId: "R9-minimal",
  });

  assert.equal(result.ok, true);
  assert.equal(client.writes.length, 1);
  assert.deepEqual(client.writes[0].body, {
    price_status: "on_request",
  }, "identical price stays out of the PATCH");
});

test("INVARIANT 5: an identical re-run reports 100% skip", async () => {
  const client = createMockDirectus({
    products: [
      mockProduct("p1", { sku: "SKU-P1", sku_normalized: "SKUP1" }),
      mockProduct("p3", { sku: "SKU-P3", sku_normalized: "SKUP3" }),
    ],
  });
  const rows = normalized([
    { sku: "SKU-P1", price: 1111 },
    { sku: "SKU-NEW", price: 2222 },
    { sku: "SKU-P3", price: 1000 },
  ]);

  const first = await run(client, {
    normalizedRows: rows,
    manifest: manifestFor(3),
    apply: true,
    releaseId: "R9-idempotent",
  });
  assert.equal(first.summary.rows.create, 1);
  assert.equal(first.summary.rows.patch, 1);
  assert.equal(first.summary.rows.skip, 1);

  const writesAfterFirst = client.writes.length;
  const second = await run(client, {
    normalizedRows: rows,
    manifest: manifestFor(3),
    apply: true,
    releaseId: "R9-idempotent",
  });
  assert.equal(second.summary.rows.total, 3);
  assert.equal(second.summary.rows.skip, 3, "100% skip on identical re-run");
  assert.equal(second.summary.rows.create, 0);
  assert.equal(second.summary.rows.patch, 0);
  assert.equal(client.writes.length, writesAfterFirst, "no additional writes");
});

test("INVARIANT 6: an interrupted batch resumes at the exact offset", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "jd-importer-"));
  try {
    const client = createMockDirectus({
      products: [
        mockProduct("p2", { sku: "SKU-P2", sku_normalized: "SKUP2" }),
        mockProduct("p3", { sku: "SKU-P3", sku_normalized: "SKUP3" }),
      ],
      failRules: [{ match: /\/items\/products\/p2$/, times: 3 }],
    });
    const rows = normalized([
      { sku: "SKU-NEW", price: 2222 },
      { sku: "SKU-P2", price: 3333 },
      { sku: "SKU-P3", price: 4444 },
    ]);
    const manifest = manifestFor(3);

    await assert.rejects(
      () =>
        run(client, {
          normalizedRows: rows,
          manifest,
          apply: true,
          releaseId: "R9-resume",
          outputDirectory: directory,
        }),
      /--resume=1/s,
    );
    assert.equal(client.writes.length, 1, "only the create went through");
    const reportAfterFirst = (await readFile(path.join(directory, "catalog-import-apply-report.ndjson"), "utf8"))
      .split(/\r?\n/)
      .filter((line) => line.trim());
    assert.equal(reportAfterFirst.length, 2);
    assert.equal(JSON.parse(reportAfterFirst[0]).outcome, "create-draft");
    assert.equal(JSON.parse(reportAfterFirst[1]).outcome, "interrupted");

    const resumed = await run(client, {
      normalizedRows: rows,
      manifest,
      apply: true,
      releaseId: "R9-resume",
      outputDirectory: directory,
      resumeOffset: 1,
    });
    assert.equal(resumed.ok, true);
    assert.equal(resumed.summary.rows.patch, 2);
    assert.equal(resumed.summary.rows.skip, 1, "record 0 re-plans as skip");

    // Exact offset continuation: no second create, only the two patches.
    const writesInResume = client.writes.slice(1);
    assert.equal(writesInResume.length, 2);
    assert.ok(
      writesInResume.every(
        (write) => write.method === "PATCH" && /\/items\/products\/p[23]$/.test(write.path),
      ),
      "the resume must not repeat the create",
    );

    // The report is append-only: run 1 entries + 3 resume entries.
    const reportAfterResume = (await readFile(path.join(directory, "catalog-import-apply-report.ndjson"), "utf8"))
      .split(/\r?\n/)
      .filter((line) => line.trim());
    assert.equal(reportAfterResume.length, 5);
    assert.equal(JSON.parse(reportAfterResume[2]).outcome, "resume-skipped");

    // A third run over the same state is a full no-op.
    const third = await run(client, {
      normalizedRows: rows,
      manifest,
      apply: true,
      releaseId: "R9-resume",
    });
    assert.equal(third.summary.rows.skip, 3);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("INVARIANT 10: catalog reads are paged at 500 and limit=-1 never appears", async () => {
  const products = Array.from({ length: PAGE_SIZE * 2 + 1 }, (_, index) =>
    mockProduct(`p${String(index + 1).padStart(5, "0")}`),
  );
  const edges = Array.from({ length: PAGE_SIZE + 1 }, (_, index) => ({
    id: `e${String(index + 1).padStart(5, "0")}`,
    canonical_key: `analog:x${index}:y${index}`,
  }));
  const client = createMockDirectus({ products, edges });

  const result = await run(client, {
    profile: getProfile("analogs-opt-in"),
    manifest: manifestFor(1, "analogs-opt-in"),
    normalizedRows: normalized([{ sku: "SKU-P00001", price: 1111 }]),
    approvalRef: "APPROVAL-PAGING",
  });
  assert.equal(result.ok, true);
  assert.equal(result.summary.productPages, 3);
  assert.equal(result.summary.edgePages, 2);

  for (const request of client.requests) {
    assert.ok(
      !request.path.includes("limit=-1"),
      `limit=-1 must never appear: ${request.path}`,
    );
    if (request.path.startsWith("/items/products?") || request.path.startsWith("/items/products_analogs?")) {
      const params = new URL(request.path, "https://directus.test").searchParams;
      assert.equal(params.get("limit"), "500");
      assert.equal(params.get("sort"), "id");
      assert.ok(Number(params.get("page")) >= 1);
    }
  }
});

test("an opt-in profile without approval refuses before any client request", async () => {
  const client = createMockDirectus({ products: [mockProduct("p1")] });
  await assert.rejects(
    () =>
      run(client, {
        profile: getProfile("editorial-opt-in"),
        manifest: manifestFor(1, "editorial-opt-in"),
        normalizedRows: normalized([{ sku: "SKU-P1", title: "t" }]),
      }),
    /approval-ref/s,
  );
  assert.equal(client.requests.length, 0, "not a single request may be sent");
});

test("stops before any write when the profile needs a missing schema field", async () => {
  const client = createMockDirectus({ products: [mockProduct("p1")] });
  const result = await run(client, {
    profile: getProfile("trusted-weight"),
    manifest: manifestFor(1, "trusted-weight"),
    normalizedRows: normalized([{ sku: "SKU-P1", weight: 5 }]),
    approvalRef: "APPROVAL-WEIGHT",
    apply: true,
    releaseId: "R9-weight",
  });

  assert.equal(result.stopped, true);
  assert.equal(result.applied, false);
  assert.ok(
    result.blockers.some(
      (blocker) => blocker.code === "missing-product-field" && blocker.detail.includes("weight"),
    ),
  );
  assert.equal(client.writes.length, 0);
});

test("transient write failures are retried and recovered", async () => {
  const client = createMockDirectus({
    products: [mockProduct("p1", { sku: "SKU-P1", sku_normalized: "SKUP1" })],
    failRules: [{ match: /\/items\/products\/p1$/, times: 1 }],
  });
  const result = await run(client, {
    normalizedRows: normalized([{ sku: "SKU-P1", price: 4242 }]),
    apply: true,
    releaseId: "R9-retry",
  });
  assert.equal(result.ok, true);
  assert.equal(result.summary.retries, 1);
  assert.equal(client.writes.length, 1);
  assert.equal(client.store.products[0].price, 4242);
});

test("write guards refuse forbidden fields at write time", () => {
  assert.throws(
    () => assertPatchWithinAllowlist(operations, { price: 1, title: "x" }),
    /title/s,
  );
  assert.doesNotThrow(() => assertPatchWithinAllowlist(operations, { price: 1 }));
  assert.throws(
    () => assertCreatePayloadAllowed(operations, { status: "published", sku: "A" }),
    /draft/s,
  );
  assert.throws(
    () => assertCreatePayloadAllowed(operations, { status: "draft", sku: "A", slug: "x" }),
    /slug/s,
  );
  assert.doesNotThrow(() =>
    assertCreatePayloadAllowed(operations, { status: "draft", sku: "A", price: 5 }),
  );
});

test("apply artifacts land in the closed output directory only", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "jd-importer-"));
  try {
    const client = createMockDirectus({
      products: [
        mockProduct("p1", { sku: "SKU-P1", sku_normalized: "SKUP1", price: "1000.00", source_name: "old-feed" }),
      ],
    });
    const result = await run(client, {
      normalizedRows: normalized([{ sku: "SKU-P1", price: 1234.5 }]),
      manifest: manifestFor(1),
      apply: true,
      releaseId: "R9-artifacts",
      outputDirectory: directory,
    });
    assert.equal(result.ok, true);

    const manifest = JSON.parse(
      await readFile(path.join(directory, "catalog-import-manifest.json"), "utf8"),
    );
    assert.equal(manifest.profile, "operations-default");
    assert.doesNotThrow(() => assertSafeArtifact(manifest));

    const plan = JSON.parse(
      await readFile(path.join(directory, "catalog-import-plan.json"), "utf8"),
    );
    assert.equal(plan.entries.length, 1);
    assert.equal(plan.entries[0].outcome, "patch-minimal-diff");
    assert.doesNotThrow(() => assertSafeArtifact(plan));

    const beforeState = (await readFile(path.join(directory, "catalog-import-before-state.ndjson"), "utf8"))
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
    assert.equal(beforeState.length, 1);
    assert.equal(beforeState[0].product_id, "p1");
    assert.deepEqual(
      beforeState[0].before,
      operations.fields.map((field) => ({
        field,
        value:
          field === "price"
            ? "1000.00"
            : field === "price_status"
              ? "fixed"
              : field === "availability_status"
                ? "on_request"
                : field === "source_name"
                  ? "old-feed"
                  : null,
      })),
    );
    assert.match(beforeState[0].protected_sha256, /^[0-9a-f]{64}$/);

    const summary = JSON.parse(
      await readFile(path.join(directory, "catalog-import-summary.json"), "utf8"),
    );
    assert.equal(summary.release_id, "R9-artifacts");
    assert.equal(summary.writes.patches, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("an input mutated since the stored manifest refuses the apply", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "jd-importer-"));
  const inputFile = path.join(directory, "input.ndjson");
  try {
    await writeFile(inputFile, '{"sku": "SKU-P1", "price": 100}\n', "utf8");
    const client = createMockDirectus({
      products: [mockProduct("p1", { sku: "SKU-P1", sku_normalized: "SKUP1" })],
    });

    const { readInputFile } = await import("./manifest.mjs");
    const first = await readInputFile(inputFile);
    const manifest = buildInputManifest({
      profileName: "operations-default",
      sha256: first.sha256,
      bytes: first.bytes,
      rowCount: first.rowCount,
      createdAt: "2026-08-17T00:00:00.000Z",
    });
    await run(client, {
      normalizedRows: normalized(first.rows),
      manifest,
      outputDirectory: directory,
    });

    await writeFile(
      inputFile,
      '{"sku": "SKU-P1", "price": 200}\n{"sku": "SKU-P2", "price": 300}\n',
      "utf8",
    );
    const second = await readInputFile(inputFile);
    // The CLI always rebuilds the manifest from the CURRENT input — that is
    // exactly what must collide with the stored one.
    const secondManifest = buildInputManifest({
      profileName: "operations-default",
      sha256: second.sha256,
      bytes: second.bytes,
      rowCount: second.rowCount,
      createdAt: "2026-08-17T00:00:00.000Z",
    });
    await assert.rejects(
      () =>
        run(client, {
          normalizedRows: normalized(second.rows),
          manifest: secondManifest,
          outputDirectory: directory,
        }),
      /changed since the stored manifest/s,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("idempotency keys are stable for identical plans", () => {
  const plan = {
    skuKey: "SKUP1",
    outcome: "patch-minimal-diff",
    patch: { price: 1234.5 },
    edges: [],
  };
  assert.equal(idempotencyKeyFor(plan), idempotencyKeyFor({ ...plan }));
  assert.notEqual(
    idempotencyKeyFor(plan),
    idempotencyKeyFor({ ...plan, patch: { price: 9999 } }),
  );
});

test("created products are drafts and never publish existing ones", async () => {
  const client = createMockDirectus({
    products: [
      mockProduct("p1", { sku: "SKU-P1", sku_normalized: "SKUP1", status: "published" }),
    ],
  });
  const result = await run(client, {
    normalizedRows: normalized([
      { sku: "SKU-NEW", price: 2222, status: "published" },
      { sku: "SKU-P1", price: 1111 },
    ]),
    apply: true,
    releaseId: "R9-draft",
  });
  assert.equal(result.ok, true);
  const created = client.store.products.find((product) => product.sku === "SKU-NEW");
  assert.equal(created.status, "draft");
  const published = client.store.products.find((product) => product.id === "p1");
  assert.equal(published.status, "published", "existing status untouched");
  assert.equal(result.summary.rows.statusForcedToDraft, 1);
});

test("INVARIANT 4 end-to-end: the create POST always carries status draft even when the row had none", async () => {
  const client = createMockDirectus({ products: [] });
  const result = await run(client, {
    apply: true,
    releaseId: "R9-E2E",
    normalizedRows: normalized([{ sku: "SYN-NOSTATUS", price: 100 }]),
    // fresh index: the row is new -> create-draft
    bySkuKey: new Map(),
    edgeKeys: new Set(),
  });
  assert.equal(result.ok, true);
  const posts = client.requests.filter(({ method }) => method === "POST");
  assert.equal(posts.length, 1, "one create");
  const body =
    typeof posts[0].body === "string" ? JSON.parse(posts[0].body) : posts[0].body;
  assert.equal(body.status, "draft", "apply layer forces draft on the POST");
  assert.equal(body.sku, "SYN-NOSTATUS");
});
