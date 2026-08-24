import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const compose = await readFile(new URL("./compose.production.yml", import.meta.url), "utf8");
const envExample = await readFile(new URL("./seo-factory.env.example", import.meta.url), "utf8");
const releaseRunbook = await readFile(
  new URL("../docs/runbooks/seo-factory-release-b.md", import.meta.url),
  "utf8",
);

test("SEO worker is profile-gated and disabled when flags/token are missing", () => {
  assert.match(compose, /seo-worker:/u);
  assert.match(compose, /profiles:\s*\["seo-factory"\]/u);
  assert.match(compose, /SEO_FACTORY_ENABLED:\s*\$\{SEO_FACTORY_ENABLED:-false\}/u);
  assert.match(compose, /SEO_FACTORY_PRODUCTION_SCHEDULE:\s*\$\{SEO_FACTORY_PRODUCTION_SCHEDULE:-false\}/u);
  assert.match(compose, /SEO_WORKER_TOKEN:\s*\$\{SEO_WORKER_TOKEN:-\}/u);
  assert.match(envExample, /SEO_FACTORY_ALLOW_PUBLISH=false/u);
});

test("Core rollout gives the SEO Worker no direct collection permissions", () => {
  assert.match(releaseRunbook, /no direct collection permissions/iu);
  assert.doesNotMatch(
    releaseRunbook,
    /\bIt can read\s+published\b|\bcreate\/update\s+`?seo_work_items`?|\bcreate\/update\s+articles\b/iu,
  );
});
