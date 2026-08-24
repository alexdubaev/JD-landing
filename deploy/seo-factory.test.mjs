import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const compose = await readFile(new URL("./compose.production.yml", import.meta.url), "utf8");
const envExample = await readFile(new URL("./seo-factory.env.example", import.meta.url), "utf8");
const releaseRunbook = await readFile(
  new URL("../docs/runbooks/seo-factory-release-b.md", import.meta.url),
  "utf8",
);
const coreChecklist = await readFile(
  new URL("../docs/runbooks/seo-factory-release-b1-core-checklist.md", import.meta.url),
  "utf8",
);

function normalizedSecurityProse(markdown) {
  return markdown.replaceAll(/[`*]/gu, "").replaceAll(/\s+/gu, " ").trim();
}

function assertCoreWorkerBoundary(markdown) {
  const prose = normalizedSecurityProse(markdown);
  assert.match(prose, /no direct collection permissions/iu);

  const protectedCollections = "(?:products|categories|pages|seo_work_items|articles)";
  const directItemsRoute = `\\/items\\/${protectedCollections}\\b`;
  const directGrantPatterns = [
    new RegExp(
      `\\b(?:SEO Worker|worker(?: token)?)\\b.{0,120}\\b(?:can|may|should|must|is allowed to|has permission to|has access to)\\b.{0,80}${directItemsRoute}`,
      "iu",
    ),
    new RegExp(
      `\\b(?:allow|grant|give|permit|authorize)\\b.{0,80}\\b(?:the )?(?:SEO Worker|worker(?: token)?)\\b.{0,100}(?:${directItemsRoute}|direct collection permissions|(?:read|write|create|update|delete|access)\\b.{0,50}\\b${protectedCollections}\\b)`,
      "iu",
    ),
    new RegExp(
      `\\b(?:SEO Worker|worker(?: token)?)\\b.{0,80}\\b(?:uses?|calls?|invokes?)\\b.{0,60}${directItemsRoute}`,
      "iu",
    ),
    new RegExp(
      `\\b(?:SEO Worker|worker(?: token)?)\\b.{0,120}\\b(?:can|may|is allowed to|has permission to|has access to)\\b.{0,80}\\b(?:read|write|create|update|delete|access)\\b.{0,80}\\b${protectedCollections}\\b`,
      "iu",
    ),
    /\bIt can read\s+published\b|\bcreate\/update\s+seo_work_items\b|\bcreate\/update\s+articles\b/iu,
  ];
  for (const directGrantPattern of directGrantPatterns) {
    assert.doesNotMatch(prose, directGrantPattern);
  }

  const routeReferences = new RegExp(directItemsRoute, "giu");
  for (const reference of prose.matchAll(routeReferences)) {
    const context = prose.slice(
      Math.max(0, reference.index - 320),
      Math.min(prose.length, reference.index + reference[0].length + 200),
    );
    assert.match(
      context,
      /\b(?:denied?|denial|forbidden|forbid|must not|never|no batch call targets|unexpected direct collection access)\b/iu,
      `${reference[0]} must appear only in denial/prohibition context`,
    );
  }
}

test("SEO worker is profile-gated and disabled when flags/token are missing", () => {
  assert.match(compose, /seo-worker:/u);
  assert.match(compose, /profiles:\s*\["seo-factory"\]/u);
  assert.match(compose, /SEO_FACTORY_ENABLED:\s*\$\{SEO_FACTORY_ENABLED:-false\}/u);
  assert.match(compose, /SEO_FACTORY_PRODUCTION_SCHEDULE:\s*\$\{SEO_FACTORY_PRODUCTION_SCHEDULE:-false\}/u);
  assert.match(compose, /SEO_WORKER_TOKEN:\s*\$\{SEO_WORKER_TOKEN:-\}/u);
  assert.match(envExample, /SEO_FACTORY_ALLOW_PUBLISH=false/u);
});

test("both Core rollout documents give the SEO Worker no direct collection permissions", () => {
  assertCoreWorkerBoundary(releaseRunbook);
  assertCoreWorkerBoundary(coreChecklist);
});

test("Core rollout assertions reject semantic direct collection grants", () => {
  for (const unsafeDocument of [
    `${releaseRunbook}\nThe SEO Worker can GET /items/products directly.`,
    `${releaseRunbook}\nDirect collection access is denied. The SEO Worker uses /items/pages directly.`,
    `${coreChecklist}\nGrant the SEO Worker direct write access to /items/articles.`,
    `${coreChecklist}\nGrant SEO Worker read permission on products.`,
    `${coreChecklist}\nThe worker can POST /items/seo_work_items directly.`,
    `${coreChecklist}\nAllow worker direct collection permissions for seo_work_items.`,
  ]) {
    assert.throws(() => assertCoreWorkerBoundary(unsafeDocument));
  }
});
