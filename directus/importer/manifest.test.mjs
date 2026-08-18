import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  MANIFEST_VERSION,
  buildInputManifest,
  findDuplicateSkuKeys,
  readInputFile,
  readNdjsonFile,
  sha256Hex,
  validateManifest,
  verifyManifestInput,
} from "./manifest.mjs";

const FIXTURE = path.join(import.meta.dirname, "fixtures", "operations-sample.ndjson");

test("readInputFile fingerprints the exact bytes and parses NDJSON rows", async () => {
  const input = await readInputFile(FIXTURE);
  assert.equal(input.rowCount, 8);
  assert.equal(input.errors.length, 0);
  assert.equal(input.sha256, sha256Hex(input.content));
  assert.equal(input.bytes, Buffer.byteLength(input.content, "utf8"));
  assert.equal(input.rows[0].sku, "SYN-0001");
});

test("readNdjsonFile reports unparseable lines with line numbers", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "jd-importer-"));
  try {
    const file = path.join(directory, "broken.ndjson");
    await writeFile(file, '{"sku": "A1"}\n\n{not json}\n{"sku": "A2"}\n', "utf8");
    const { rows, errors } = await readNdjsonFile(file);
    assert.equal(rows.length, 2);
    assert.deepEqual(
      errors.map(({ line }) => line),
      [3],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("findDuplicateSkuKeys detects duplicates across trim/case/punctuation", () => {
  assert.deepEqual(
    findDuplicateSkuKeys([
      { sku: "syn-0001" },
      { sku: "SYN 0001" },
      { sku: "syn.0001" },
      { sku: "SYN-0002" },
    ]),
    ["SYN0001"],
  );
  assert.deepEqual(findDuplicateSkuKeys([{ sku: "A1" }, { sku: "B2" }]), []);
});

test("buildInputManifest freezes an immutable fingerprint", () => {
  const manifest = buildInputManifest({
    profileName: "operations-default",
    sha256: "a".repeat(64),
    bytes: 100,
    rowCount: 3,
    createdAt: "2026-08-17T00:00:00.000Z",
  });
  assert.equal(manifest.version, MANIFEST_VERSION);
  assert.equal(manifest.profile, "operations-default");
  assert.deepEqual(manifest.input, {
    sha256: "a".repeat(64),
    bytes: 100,
    row_count: 3,
  });
  assert.throws(
    () => {
      manifest.input.sha256 = "b".repeat(64);
    },
    TypeError,
    "the manifest is deep-frozen",
  );
  assert.throws(() => buildInputManifest({ profileName: "x", sha256: "nope", bytes: 1, rowCount: 1 }));
});

test("validateManifest checks shape and known profiles", () => {
  const manifest = buildInputManifest({
    profileName: "operations-default",
    sha256: "a".repeat(64),
    bytes: 1,
    rowCount: 1,
    createdAt: "2026-08-17T00:00:00.000Z",
  });
  assert.equal(validateManifest(manifest).ok, true);
  assert.equal(
    validateManifest({ ...manifest, profile: "warehouse-stock" }, {
      knownProfileNames: ["operations-default"],
    }).ok,
    false,
  );
  assert.equal(validateManifest(null).ok, false);
  assert.equal(
    validateManifest({ ...manifest, version: 99 }).ok,
    false,
  );
});

test("verifyManifestInput detects mutated inputs", () => {
  const manifest = buildInputManifest({
    profileName: "operations-default",
    sha256: "a".repeat(64),
    bytes: 10,
    rowCount: 2,
    createdAt: "2026-08-17T00:00:00.000Z",
  });
  assert.equal(
    verifyManifestInput(manifest, { sha256: "a".repeat(64), bytes: 10, rowCount: 2 }).ok,
    true,
  );
  const mutated = verifyManifestInput(manifest, {
    sha256: "b".repeat(64),
    bytes: 11,
    rowCount: 3,
  });
  assert.equal(mutated.ok, false);
  assert.equal(mutated.mismatches.length, 3);
});

test("the same file always yields the same sha256 fingerprint", async () => {
  const first = await readInputFile(FIXTURE);
  const second = await readInputFile(FIXTURE);
  assert.equal(first.sha256, second.sha256);
  assert.equal(first.bytes, second.bytes);
  assert.equal(first.rowCount, second.rowCount);
});
