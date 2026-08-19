import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { schemaBlueprint } from "./blueprint.mjs";

test("deployment stays within the Directus 12 Core collection limit", async () => {
  const countedCollections = schemaBlueprint.collections.filter(
    ({ folder }) => !folder,
  );
  assert.ok(countedCollections.length <= 25);

  const productionCompose = await readFile(
    new URL("../../deploy/compose.production.yml", import.meta.url),
    "utf8",
  );
  const localExample = await readFile(
    new URL("../.env.example", import.meta.url),
    "utf8",
  );

  assert.match(productionCompose, /directus\/directus:12\.1\.1/);
  assert.match(
    productionCompose,
    /CONTENT_SECURITY_POLICY_DIRECTIVES__FRAME_SRC: https:\/\/deere-shop\.ru/,
  );
  assert.match(localExample, /DIRECTUS_VERSION=12\.1\.1/);
});
