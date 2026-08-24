import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./directus-extension-seo-factory/dist/index.js", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("./directus-extension-seo-factory/package.json", import.meta.url), "utf8"));

test("SEO Factory extension uses a row lock and bounded lease claim", () => {
  assert.equal(packageJson.directus?.extension?.type ?? packageJson["directus:extension"]?.type, "endpoint");
  assert.match(source, /forUpdate\(\)/u);
  assert.match(source, /skipLocked\(\)/u);
  assert.match(source, /SEO_FACTORY_WORKER_ROLE_ID/u);
  assert.match(source, /approved.*retryable/su);
  assert.match(source, /processing/u);
  assert.match(source, /draft_created/u);
  assert.doesNotMatch(source, /update\(\{[^}]*status\s*:\s*["']published/su);
});
