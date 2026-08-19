import assert from "node:assert/strict";
import test from "node:test";

import { schemaBlueprint } from "../schema/blueprint.mjs";
import {
  buildVersioningBlueprint,
  versioningBlueprint,
} from "./versioning-blueprint.mjs";

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

test("builds Directus preview URLs with an item id and a version key for only the approved collections", () => {
  const blueprint = buildVersioningBlueprint(
    "https://cms.example.test/deere-shop/preview",
  );

  assert.deepEqual(blueprint.collections, {
    articles: {
      versioning: true,
      previewUrl:
        "https://cms.example.test/deere-shop/preview/articles/{{id}}?version={{$version}}",
    },
    pages: {
      versioning: true,
      previewUrl:
        "https://cms.example.test/deere-shop/preview/pages/{{id}}?version={{$version}}",
    },
    home_page: {
      versioning: true,
      previewUrl:
        "https://cms.example.test/deere-shop/preview/home_page/{{id}}?version={{$version}}",
    },
  });
});

test("permits a loopback HTTP preview bridge for disposable local staging only", () => {
  assert.doesNotThrow(() =>
    buildVersioningBlueprint("http://127.0.0.1:8057/deere-shop/preview"),
  );
  assert.throws(
    () => buildVersioningBlueprint("http://cms.example.test/deere-shop/preview"),
    /HTTPS/u,
  );
});
