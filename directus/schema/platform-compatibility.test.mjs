import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { schemaBlueprint } from "./blueprint.mjs";

test("deployment stays within the Directus 12 Core collection limit", async () => {
  assert.ok(schemaBlueprint.collections.length <= 25);

  const productionCompose = await readFile(
    new URL("../../deploy/compose.production.yml", import.meta.url),
    "utf8",
  );
  const localExample = await readFile(
    new URL("../.env.example", import.meta.url),
    "utf8",
  );

  assert.match(productionCompose, /directus\/directus:12\.1\.1/);
  assert.match(localExample, /DIRECTUS_VERSION=12\.1\.1/);
});
