import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertArtifactDirectory,
  assertArtifactFile,
  createReleasePacket,
  hashRows,
  serializeArtifact,
  writeArtifactsExclusive,
} from "./artifacts.mjs";

test("serializes object keys and rows deterministically", () => {
  const value = {
    rows: [
      { slug: "second", id: "2" },
      { id: "1", slug: "first" },
    ],
    zeta: true,
    alpha: { second: 2, first: 1 },
  };

  assert.equal(
    serializeArtifact(value, { sortRowsBy: "id" }),
    [
      "{",
      '  "alpha": {',
      '    "first": 1,',
      '    "second": 2',
      "  },",
      '  "rows": [',
      "    {",
      '      "id": "1",',
      '      "slug": "first"',
      "    },",
      "    {",
      '      "id": "2",',
      '      "slug": "second"',
      "    }",
      "  ],",
      '  "zeta": true',
      "}",
      "",
    ].join("\n"),
  );
});

test("hashes the same rows identically regardless of input order", () => {
  const first = hashRows([
    { id: "b", status: "draft" },
    { id: "a", status: "published" },
  ]);
  const second = hashRows([
    { status: "published", id: "a" },
    { status: "draft", id: "b" },
  ]);

  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("hashes id-less metadata rows independently of API order", () => {
  const first = hashRows([
    { collection: "products", field: "category" },
    { collection: "categories", field: "parent" },
  ]);
  const second = hashRows([
    { field: "parent", collection: "categories" },
    { field: "category", collection: "products" },
  ]);

  assert.equal(first, second);
});

test("rejects relative and repository-contained artifact directories", async () => {
  const repositoryRoot = path.resolve(".");

  await assert.rejects(
    assertArtifactDirectory("relative/release", { repositoryRoot }),
    /absolute/,
  );
  await assert.rejects(
    assertArtifactDirectory(repositoryRoot, {
      repositoryRoot,
    }),
    /outside the repository/,
  );
});

test("requires the closed artifact directory to exist before use", async () => {
  const missing = path.join(os.tmpdir(), `missing-jd-release-${Date.now()}`);

  await assert.rejects(
    assertArtifactDirectory(missing, { repositoryRoot: path.resolve(".") }),
    /does not exist/,
  );
});

test("accepts baseline files only through absolute paths outside the repository", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jd-release-test-"));
  const external = path.join(root, "baseline.json");
  await writeFile(external, "{}\n", "utf8");

  assert.equal(
    await assertArtifactFile(external, { repositoryRoot: path.resolve(".") }),
    external,
  );
  await assert.rejects(
    assertArtifactFile("baseline.json", { repositoryRoot: path.resolve(".") }),
    /absolute/,
  );
  await assert.rejects(
    assertArtifactFile(path.resolve("package.json"), {
      repositoryRoot: path.resolve("."),
    }),
    /outside the repository/,
  );
});

test("refuses to reuse an existing release id", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jd-release-test-"));
  const output = path.join(root, "packets");
  await mkdir(output);

  await createReleasePacket(output, {
    releaseId: "R1-2026-08-13",
    repositoryRoot: path.resolve("."),
  });

  await assert.rejects(
    createReleasePacket(output, {
      releaseId: "R1-2026-08-13",
      repositoryRoot: path.resolve("."),
    }),
    /already exists/,
  );
});

test("rejects token and PII fields before writing artifacts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jd-release-test-"));
  const packet = path.join(root, "packet");
  await mkdir(packet);
  await writeFile(
    path.join(packet, "unsafe.json"),
    JSON.stringify({ access_token: "secret", email: "buyer@example.com" }),
  );

  await assert.rejects(
    assertArtifactDirectory(packet, {
      repositoryRoot: path.resolve("."),
      scanExistingFiles: true,
    }),
    /sensitive.*field/i,
  );
});

test("does not leave a partial packet when any artifact name already exists", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jd-release-test-"));
  await writeFile(path.join(root, "counts-before.json"), "existing\n", "utf8");

  await assert.rejects(
    writeArtifactsExclusive(root, {
      "baseline-before.json": { version: 1 },
      "counts-before.json": { products: 12_971 },
    }),
    /already exists/,
  );
  await assert.rejects(access(path.join(root, "baseline-before.json")));
  assert.equal(
    await readFile(path.join(root, "counts-before.json"), "utf8"),
    "existing\n",
  );
});

test("rejects broader secret, PII, and product row artifacts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jd-release-test-"));
  await writeFile(
    path.join(root, "unsafe.ndjson"),
    [
      JSON.stringify({ authorization: "Bearer secret" }),
      JSON.stringify({ name: "Buyer", address: "Private address" }),
      JSON.stringify({ id: "p1", sku: "SKU-1", title: "Private product export" }),
    ].join("\n"),
    "utf8",
  );

  await assert.rejects(
    assertArtifactDirectory(root, {
      repositoryRoot: path.resolve("."),
      scanExistingFiles: true,
    }),
    /sensitive|product/i,
  );
});

test("rejects malformed JSON instead of skipping the safety scan", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jd-release-test-"));
  await writeFile(path.join(root, "broken.json"), "{not-json", "utf8");

  await assert.rejects(
    assertArtifactDirectory(root, {
      repositoryRoot: path.resolve("."),
      scanExistingFiles: true,
    }),
    /invalid JSON/i,
  );
});

test("rejects sparse product exports and contextual PII records", async () => {
  const fixtures = [
    { products: [{ id: "p1", title: "Part", slug: "part", category: "c1", status: "published" }] },
    { leads: [{ id: "l1", name: "Buyer" }] },
    { payload: { customer_name: "Buyer", mobile: "+70000000000" } },
  ];

  for (const [index, fixture] of fixtures.entries()) {
    const root = await mkdtemp(path.join(os.tmpdir(), "jd-release-test-"));
    await writeFile(
      path.join(root, `unsafe-${index}.json`),
      JSON.stringify(fixture),
      "utf8",
    );
    await assert.rejects(
      assertArtifactDirectory(root, {
        repositoryRoot: path.resolve("."),
        scanExistingFiles: true,
      }),
      /sensitive|product/i,
    );
  }
});
