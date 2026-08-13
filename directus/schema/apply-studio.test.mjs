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

test("applies Russian collection, field, locale, and user metadata", async () => {
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

  const actions = await applyStudioBlueprint(client, blueprint);

  assert.ok(actions.includes("update collection home_page"));
  assert.ok(actions.includes("create group home_page.group_hero"));
  assert.ok(actions.includes("update field home_page.hero_title"));
  assert.ok(actions.includes("set default language ru-RU"));
  assert.ok(actions.includes("set user editor language ru-RU"));
  assert.ok(requests.some(({ path, method }) => path === "/settings" && method === "PATCH"));
  assert.ok(requests.some(({ path, method }) => path === "/users/editor" && method === "PATCH"));
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
    const actions = await applyStudioBlueprint(client, blueprint);
    assert.deepEqual(actions, []);
  });
});
