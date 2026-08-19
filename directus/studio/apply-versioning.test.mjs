import assert from "node:assert/strict";
import test from "node:test";

import { applyVersioning } from "./apply-versioning.mjs";
import { versioningBlueprint } from "./versioning-blueprint.mjs";

const collectionRow = (name, meta = {}) => ({ collection: name, meta });

test("enables versioning with a minimal meta patch per collection", async () => {
  const requests = [];
  const client = {
    async request(path, options = {}) {
      requests.push({ path, method: options.method ?? "GET", body: options.body });
      if (path === "/collections") {
        return [
          collectionRow("articles", { sort: 1, translations: [{ language: "ru-RU" }] }),
          collectionRow("pages"),
          collectionRow("home_page", { singleton: true }),
          collectionRow("products"),
        ];
      }
      return {};
    },
  };

  const actions = await applyVersioning(client);

  assert.deepEqual(actions, [
    "enable versioning articles",
    "enable versioning pages",
    "enable versioning home_page",
  ]);
  const patches = requests.filter(({ method }) => method === "PATCH");
  assert.deepEqual(
    patches.map(({ path }) => path),
    ["/collections/articles", "/collections/pages", "/collections/home_page"],
  );
  // Only the versioning meta key is ever written: unrelated meta managed by
  // apply-studio (translations, sort, singleton, …) must stay untouched.
  for (const { body } of patches) {
    assert.deepEqual(JSON.parse(body), { meta: { versioning: true } });
  }
});

test("is a no-op when versioning is already enabled everywhere", async () => {
  const client = {
    async request(path) {
      if (path === "/collections") {
        return Object.keys(versioningBlueprint.collections).map((name) =>
          collectionRow(name, { versioning: true, translations: [{ language: "ru-RU" }] }),
        );
      }
      throw new Error(`Unexpected write: ${path}`);
    },
  };

  assert.deepEqual(await applyVersioning(client), []);
});

test("skips blueprint collections missing from the instance", async () => {
  const requests = [];
  const client = {
    async request(path, options = {}) {
      requests.push({ path, method: options.method ?? "GET" });
      if (path === "/collections") {
        return [collectionRow("articles", { versioning: true }), collectionRow("pages")];
      }
      return {};
    },
  };

  assert.deepEqual(await applyVersioning(client), [
    "enable versioning pages",
    "skip missing collection home_page",
  ]);
  assert.deepEqual(
    requests.filter(({ method }) => method === "PATCH").map(({ path }) => path),
    ["/collections/pages"],
  );
});

test("dry-run reports planned actions without writing", async () => {
  const requests = [];
  const client = {
    async request(path, options = {}) {
      requests.push({ path, method: options.method ?? "GET" });
      if (path === "/collections") return [collectionRow("articles")];
      return {};
    },
  };

  const actions = await applyVersioning(client, versioningBlueprint, {
    dryRun: true,
  });

  assert.deepEqual(actions, [
    "enable versioning articles",
    "skip missing collection pages",
    "skip missing collection home_page",
  ]);
  assert.deepEqual(
    requests.map(({ method }) => method),
    ["GET"],
  );
});

test("can disable versioning again for the rollback path", async () => {
  const requests = [];
  const client = {
    async request(path, options = {}) {
      requests.push({ path, method: options.method ?? "GET", body: options.body });
      if (path === "/collections") {
        return [collectionRow("articles", { versioning: true })];
      }
      return {};
    },
  };

  const actions = await applyVersioning(client, {
    collections: { articles: { versioning: false } },
  });

  assert.deepEqual(actions, ["disable versioning articles"]);
  assert.deepEqual(
    JSON.parse(requests.find(({ method }) => method === "PATCH").body),
    { meta: { versioning: false } },
  );
});
