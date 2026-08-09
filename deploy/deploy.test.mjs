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
