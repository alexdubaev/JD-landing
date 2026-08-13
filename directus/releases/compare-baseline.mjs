import { readFile } from "node:fs/promises";
import path from "node:path";

import { isMainModule } from "../schema/apply-schema.mjs";
import {
  assertArtifactDirectory,
  assertArtifactFile,
  assertSafeArtifact,
  writeArtifactsExclusive,
} from "./lib/artifacts.mjs";

const HASH_COLLECTIONS = {
  products: "products",
  categories: "categories",
  articles: "articles",
  pages: "pages",
  pageSections: "page_sections",
  faqItems: "faq_items",
};

const EXPECTED_PATHS = {
  products: ["counts", "products", "total"],
  publishedProducts: ["counts", "products", "published"],
  galleryProducts: ["counts", "products", "galleryProducts"],
  galleryReferences: ["counts", "products", "galleryReferences"],
  categories: ["counts", "categories"],
  articles: ["counts", "articles"],
  pages: ["counts", "pages"],
  pageSections: ["counts", "pageSections"],
  faqItems: ["counts", "faqItems"],
  leads: ["counts", "leads"],
  orders: ["counts", "orders"],
  collectionCount: ["counts", "collectionCount"],
  missingCategory: ["counts", "products", "missingCategory"],
  missingMainImage: ["counts", "products", "missingMainImage"],
};

export const DEFAULT_EXPECTED_COUNTS = {
  products: 12_971,
  publishedProducts: 12_971,
  galleryProducts: 283,
  galleryReferences: 1_251,
  missingMainImage: 12_688,
  categories: 18,
  articles: 3,
  pages: 2,
  pageSections: 13,
  faqItems: 12,
  leads: 4,
  orders: 0,
  collectionCount: 25,
};

const REQUIRED_METADATA = [
  "collections",
  "fields",
  "relations",
  "flows",
  "presets",
  "permissions",
];

const readPath = (value, keys) => keys.reduce((current, key) => current?.[key], value);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const validateBaseline = (value, side) => {
  const requiredNumbers = [
    ["counts", "products", "total"],
    ["counts", "products", "published"],
    ["counts", "products", "galleryProducts"],
    ["counts", "products", "galleryReferences"],
    ["counts", "products", "missingCategory"],
    ["counts", "products", "missingMainImage"],
    ["counts", "categories"],
    ["counts", "articles"],
    ["counts", "pages"],
    ["counts", "pageSections"],
    ["counts", "faqItems"],
    ["counts", "leads"],
    ["counts", "orders"],
    ["counts", "collectionCount"],
    ["integrity", "brokenRelations"],
  ];
  const requiredHashes = Object.keys(HASH_COLLECTIONS).map((name) => ["hashes", name]);
  if (value?.version !== 1) {
    return { code: "invalid-baseline", side, path: "version" };
  }
  for (const keys of requiredNumbers) {
    const count = readPath(value, keys);
    if (!Number.isSafeInteger(count) || count < 0) {
      return { code: "invalid-baseline", side, path: keys.join(".") };
    }
  }
  for (const keys of requiredHashes) {
    if (!SHA256_PATTERN.test(readPath(value, keys))) {
      return { code: "invalid-baseline", side, path: keys.join(".") };
    }
  }
  for (const name of REQUIRED_METADATA) {
    const section = value?.metadata?.[name];
    if (
      !Number.isSafeInteger(section?.count) ||
      section.count < 0 ||
      !SHA256_PATTERN.test(section?.sha256)
    ) {
      return { code: "invalid-baseline", side, path: `metadata.${name}` };
    }
  }
  return null;
};

export function compareBaseline(
  before,
  after,
  {
    allowedCollections = [],
    allowedMetadata = [],
    expectedCounts = DEFAULT_EXPECTED_COUNTS,
  } = {},
) {
  const failures = [];
  const changes = [];
  const invalidBefore = validateBaseline(before, "before");
  const invalidAfter = validateBaseline(after, "after");
  if (invalidBefore || invalidAfter) {
    return assertSafeArtifact({
      ok: false,
      failures: [invalidBefore, invalidAfter].filter(Boolean),
      changes,
    });
  }
  const allowed = new Set(allowedCollections);
  const allowedMetadataNames = new Set(allowedMetadata);

  const beforeProducts = before?.counts?.products ?? {};
  const afterProducts = after?.counts?.products ?? {};
  if (afterProducts.total < beforeProducts.total) {
    failures.push({
      code: "product-loss",
      before: beforeProducts.total,
      after: afterProducts.total,
    });
  }
  if (afterProducts.published < beforeProducts.published) {
    failures.push({
      code: "unexpected-depublication",
      before: beforeProducts.published,
      after: afterProducts.published,
    });
  }

  for (const [hashKey, collection] of Object.entries(HASH_COLLECTIONS)) {
    if (before?.hashes?.[hashKey] === after?.hashes?.[hashKey]) continue;
    const change = { collection, kind: "hash" };
    changes.push(change);
    if (!allowed.has(collection)) {
      failures.push({ code: "protected-collection-changed", ...change });
    }
  }

  const metadataNames = new Set([
    ...Object.keys(before?.metadata ?? {}),
    ...Object.keys(after?.metadata ?? {}),
  ]);
  for (const name of [...metadataNames].sort()) {
    if (before?.metadata?.[name]?.sha256 === after?.metadata?.[name]?.sha256) continue;
    const change = { metadata: name, kind: "hash" };
    changes.push(change);
    if (!allowedMetadataNames.has(name)) {
      failures.push({ code: "protected-metadata-changed", ...change });
    }
  }

  const beforeBroken = Number(before?.integrity?.brokenRelations ?? 0);
  const afterBroken = Number(after?.integrity?.brokenRelations ?? 0);
  if (afterBroken > beforeBroken) {
    failures.push({
      code: "broken-relation",
      before: beforeBroken,
      after: afterBroken,
    });
  }

  const enforcedCounts = { ...DEFAULT_EXPECTED_COUNTS, ...expectedCounts };
  for (const [name, expected] of Object.entries(enforcedCounts)) {
    const keys = EXPECTED_PATHS[name];
    if (!keys) throw new Error(`Unknown expected count ${name}`);
    const actual = readPath(after, keys);
    if (actual !== expected) {
      failures.push({
        code: "invariant-mismatch",
        path: keys.join("."),
        expected,
        actual,
      });
    }
  }

  return assertSafeArtifact({ ok: failures.length === 0, failures, changes });
}

const argumentValue = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
};

const readJson = async (filename) => JSON.parse(await readFile(filename, "utf8"));

async function main() {
  const beforeFile = argumentValue("before") ?? process.env.JD_BASELINE_BEFORE;
  const afterFile = argumentValue("after") ?? process.env.JD_BASELINE_AFTER;
  const outputDirectory = argumentValue("output") ?? process.env.JD_RELEASE_DIR;
  if (!beforeFile || !afterFile || !outputDirectory) {
    throw new Error(
      "Set --before/--after/--output or JD_BASELINE_BEFORE/JD_BASELINE_AFTER/JD_RELEASE_DIR",
    );
  }

  const repositoryRoot = path.resolve(import.meta.dirname, "../..");
  const directory = await assertArtifactDirectory(outputDirectory, {
    repositoryRoot,
    scanExistingFiles: true,
  });
  const safeBeforeFile = await assertArtifactFile(beforeFile, { repositoryRoot });
  const safeAfterFile = await assertArtifactFile(afterFile, { repositoryRoot });

  const allowedCollections = (argumentValue("allowed-collections") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowedMetadata = (argumentValue("allowed-metadata") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const expectedFile = argumentValue("expected-counts");
  const expectedCounts = expectedFile
    ? await readJson(await assertArtifactFile(expectedFile, { repositoryRoot }))
    : {};
  const result = compareBaseline(
    await readJson(safeBeforeFile),
    await readJson(safeAfterFile),
    { allowedCollections, allowedMetadata, expectedCounts },
  );
  const filename = path.join(directory, "reconciliation.json");
  await writeArtifactsExclusive(directory, { "reconciliation.json": result });
  console.log(`Wrote reconciliation result to ${filename}`);
  if (!result.ok) process.exitCode = 1;
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
