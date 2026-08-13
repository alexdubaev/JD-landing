import test from "node:test";
import assert from "node:assert/strict";

import { applyStudioBlueprint } from "./apply-studio.mjs";

const blueprint = {
  defaultLanguage: "ru-RU",
  folders: {
    group_site: { label: "Сайт", icon: "web", sort: 1 },
  },
  collections: {
    home_page: {
      label: "Главная страница",
      group: "group_site",
      icon: "home",
      sort: 1,
      hidden: false,
      singleton: true,
    },
  },
  fields: {
    home_page: {
      groups: {
        group_hero: { label: "Первый экран", interface: "group-detail", sort: 1 },
      },
      fields: {
        hero_title: {
          label: "Заголовок",
          group: "group_hero",
          sort: 1,
          width: "full",
          note: "Главный заголовок первого экрана.",
        },
      },
    },
  },
};

test("applies Russian collection, field, locale, and user metadata only when explicitly enabled", async () => {
  const requests = [];
  const client = {
    async request(path, options = {}) {
      requests.push({ path, method: options.method ?? "GET", body: options.body });
      if (path === "/collections") {
        return [
          { collection: "group_site", meta: {} },
          { collection: "home_page", meta: {} },
        ];
      }
      if (path === "/fields/home_page") {
        return [{ field: "hero_title", meta: {} }];
      }
      if (path === "/settings") return { default_language: "en-US" };
      if (path.startsWith("/users?")) return [{ id: "editor", language: "en-US" }];
      return {};
    },
  };

  const actions = await applyStudioBlueprint(client, blueprint, {
    includeLocaleChanges: true,
  });

  assert.ok(actions.includes("update collection home_page"));
  assert.ok(actions.includes("create group home_page.group_hero"));
  assert.ok(actions.includes("update field home_page.hero_title"));
  assert.ok(actions.includes("set default language ru-RU"));
  assert.ok(actions.includes("set user editor language ru-RU"));
  assert.ok(requests.some(({ path, method }) => path === "/settings" && method === "PATCH"));
  assert.ok(requests.some(({ path, method }) => path === "/users/editor" && method === "PATCH"));
});

test("default mode is isolated from settings, users, access, and item data", async () => {
  const forbiddenPrefixes = [
    "/settings",
    "/users",
    "/roles",
    "/permissions",
    "/policies",
    "/items",
  ];
  const client = {
    async request(path) {
      assert.equal(
        forbiddenPrefixes.some((prefix) => path.startsWith(prefix)),
        false,
        `forbidden endpoint ${path}`,
      );
      if (path === "/collections") {
        return [
          { collection: "group_site", meta: {} },
          { collection: "home_page", meta: {} },
        ];
      }
      if (path === "/fields/home_page") {
        return [{ field: "hero_title", meta: {} }];
      }
      throw new Error(`unexpected endpoint ${path}`);
    },
  };

  await assert.doesNotReject(() =>
    applyStudioBlueprint(client, blueprint, { dryRun: true }),
  );
});

test("field updates contain only the Task 2 presentation allowlist", async () => {
  const writes = [];
  const scopedBlueprint = structuredClone(blueprint);
  Object.assign(scopedBlueprint.fields.home_page.fields.hero_title, {
    interface: "input-rich-text-html",
    options: { toolbar: ["bold"] },
    hidden: true,
    readonly: true,
  });
  const client = {
    async request(path, options = {}) {
      if (options.method) {
        writes.push({ path, body: JSON.parse(options.body) });
        return {};
      }
      if (path === "/collections") {
        return [
          { collection: "group_site", meta: {} },
          { collection: "home_page", meta: {} },
        ];
      }
      if (path === "/fields/home_page") {
        return [
          {
            field: "group_hero",
            meta: {
              translations: [{ language: "ru-RU", translation: "Первый экран" }],
              interface: "group-detail",
              sort: 1,
              width: "full",
              special: ["alias", "no-data", "group"],
            },
          },
          { field: "hero_title", meta: {} },
        ];
      }
      throw new Error(`unexpected endpoint ${path}`);
    },
  };

  await applyStudioBlueprint(client, scopedBlueprint);
  const collectionUpdate = writes.find(
    ({ path }) => path === "/collections/home_page",
  );
  assert.deepEqual(Object.keys(collectionUpdate.body.meta).sort(), [
    "group",
    "sort",
    "translations",
  ]);
  const update = writes.find(({ path }) => path === "/fields/home_page/hero_title");
  assert.deepEqual(Object.keys(update.body.meta).sort(), [
    "group",
    "note",
    "sort",
    "translations",
    "width",
  ]);
});

test("is idempotent when Studio metadata already matches", async () => {
  const ru = (translation) => [{ language: "ru-RU", translation }];
  const client = {
    async request(path) {
      if (path === "/collections") {
        return [
          {
            collection: "group_site",
            meta: { translations: ru("Сайт"), icon: "web", sort: 1 },
          },
          {
            collection: "home_page",
            meta: {
              translations: ru("Главная страница"),
              group: "group_site",
              icon: "home",
              sort: 1,
              hidden: false,
              singleton: true,
            },
          },
        ];
      }
      if (path === "/fields/home_page") {
        return [
          {
            field: "group_hero",
            meta: {
              translations: ru("Первый экран"),
              interface: "group-detail",
              sort: 1,
              width: "full",
              special: ["alias", "no-data", "group"],
            },
          },
          {
            field: "hero_title",
            meta: {
              translations: ru("Заголовок"),
              group: "group_hero",
              sort: 1,
              width: "full",
              note: "Главный заголовок первого экрана.",
            },
          },
        ];
      }
      if (path === "/settings") return { default_language: "ru-RU" };
      if (path.startsWith("/users?")) return [{ id: "editor", language: "ru-RU" }];
      throw new Error(`unexpected write: ${path}`);
    },
  };

  await assert.doesNotReject(async () => {
    const actions = await applyStudioBlueprint(client, blueprint, {
      includeLocaleChanges: true,
    });
    assert.deepEqual(actions, []);
  });
});
