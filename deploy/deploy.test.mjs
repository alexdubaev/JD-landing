import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const script = await readFile(new URL("./deploy.sh", import.meta.url), "utf8");

test("deploy verifies the exact CMS-unavailable fallback text", () => {
  assert.match(script, /grep -c 'Каталог временно обновляется'/u);
  assert.doesNotMatch(script, /grep -c 'Каталог временно обновляются'/u);
});

test("deploy invalidates cache before warming homepage and catalog", () => {
  const revalidate = script.indexOf('for collection in homepage categories products pages');
  const homepageWarmup = script.indexOf('http://127.0.0.1:3000/ >');
  const catalogWarmup = script.indexOf('http://127.0.0.1:3000/catalog >');

  assert.ok(revalidate >= 0, "revalidation loop is present");
  assert.ok(homepageWarmup >= 0, "homepage warm-up is present");
  assert.ok(catalogWarmup >= 0, "catalog warm-up is present");
  assert.ok(revalidate < homepageWarmup, "revalidation precedes homepage warm-up");
  assert.ok(revalidate < catalogWarmup, "revalidation precedes catalog warm-up");
});

test("deploy runs optional security preflight before any compose mutation", () => {
  const preflight = script.indexOf("preflight");
  const build = script.indexOf("docker compose -f \"$COMPOSE_FILE\" --env-file \"$ENV_FILE\" build");
  const recreate = script.indexOf("docker compose -f \"$COMPOSE_FILE\" --env-file \"$ENV_FILE\" up -d frontend");

  assert.ok(preflight >= 0, "security preflight is present");
  assert.ok(build >= 0 && preflight < build, "preflight precedes frontend build");
  assert.ok(recreate >= 0 && preflight < recreate, "preflight precedes container recreation");
  assert.match(script, /ENABLE_DIRECTUS_CMS_BASIC_AUTH/u);
  assert.match(script, /DIRECTUS_CMS_AUTH_USER/u);
  assert.match(script, /DIRECTUS_CMS_AUTH_HASH/u);
  assert.match(script, /ENABLE_RESTIC_BACKUP/u);
  assert.match(script, /RESTIC_REPOSITORY/u);
  assert.match(script, /RESTIC_PASSWORD_FILE/u);
  assert.doesNotMatch(script, /echo\s+.*\$DIRECTUS_CMS_AUTH_HASH/u);
});
