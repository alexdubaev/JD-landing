import assert from "node:assert/strict";
import test from "node:test";

import { schemaBlueprint } from "../schema/blueprint.mjs";
import { versioningBlueprint } from "./versioning-blueprint.mjs";

test("enables native versioning for exactly the approved editorial collections", () => {
  assert.deepEqual(Object.keys(versioningBlueprint.collections), [
    "articles",
    "pages",
    "home_page",
  ]);
  for (const [name, config] of Object.entries(versioningBlueprint.collections)) {
    assert.deepEqual(config, { versioning: true }, name);
  }
});

test("declares only collections that exist in the managed schema", () => {
  const schemaNames = new Set(
    schemaBlueprint.collections.map(({ name }) => name),
  );
  for (const name of Object.keys(versioningBlueprint.collections)) {
    assert.ok(schemaNames.has(name), `unknown collection ${name}`);
  }
});

test("never declares additional collection meta keys", () => {
  // The applier must be able to PATCH `meta: { versioning }` alone, so the
  // blueprint may not grow unrelated meta that would silently overwrite the
  // Studio configuration managed by apply-studio.
  for (const config of Object.values(versioningBlueprint.collections)) {
    assert.deepEqual(Object.keys(config), ["versioning"]);
  }
});
