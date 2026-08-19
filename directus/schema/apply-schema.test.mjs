import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRelationPayload,
  buildCollectionPayload,
  buildFieldPayload,
  applyBlueprint,
  isMainModule,
} from "./apply-schema.mjs";

test("builds a Directus collection payload with an explicit primary key", () => {
  const payload = buildCollectionPayload({
    name: "articles",
    icon: "article",
    singleton: false,
    fields: [
      {
        name: "id",
        type: "uuid",
        primary: true,
        required: true,
        default: "uuid",
        readonly: true,
        hidden: true,
      },
    ],
  });

  assert.equal(payload.collection, "articles");
  assert.equal(payload.schema.name, "articles");
  assert.equal(payload.fields[0].field, "id");
  assert.equal(payload.fields[0].schema.is_primary_key, true);
  assert.deepEqual(payload.fields[0].meta.special, ["uuid"]);
});

test("builds a schema-less collection folder payload", () => {
  assert.deepEqual(
    buildCollectionPayload({
      name: "group_site",
      folder: true,
      icon: "web",
      sort: 1,
      fields: [],
    }),
    {
      collection: "group_site",
      meta: {
        icon: "web",
        hidden: false,
        singleton: false,
        sort: 1,
      },
      schema: null,
    },
  );
});

test("does not request fields for schema-less folders", async () => {
  const calls = [];
  const client = {
    async request(path) {
      calls.push(path);
      if (path === "/collections" || path === "/relations") return [];
      return {};
    },
  };

  await applyBlueprint(client, {
    collections: [{ name: "group_site", folder: true, fields: [] }],
    seed: {},
  }, { dryRun: true });

  assert.deepEqual(calls, ["/collections", "/relations"]);
});

test("maps a required unique indexed string field", () => {
  const payload = buildFieldPayload({
    name: "slug",
    type: "string",
    required: true,
    unique: true,
    index: true,
    maxLength: 255,
  });

  assert.equal(payload.field, "slug");
  assert.equal(payload.type, "string");
  assert.equal(payload.meta.required, true);
  assert.equal(payload.schema.is_nullable, false);
  assert.equal(payload.schema.is_unique, true);
  assert.equal(payload.schema.is_indexed, true);
  assert.equal(payload.schema.max_length, 255);
});

test("maps numeric choices without assuming string values", () => {
  const payload = buildFieldPayload({
    name: "status_code",
    type: "integer",
    choices: [301, 302],
  });

  assert.deepEqual(payload.meta.options.choices, [
    { text: "301", value: 301 },
    { text: "302", value: 302 },
  ]);
});

test("maps aliases without creating a database column", () => {
  const payload = buildFieldPayload({
    name: "translations",
    type: "alias",
    interface: "translations",
    aliasFor: {
      collection: "articles_translations",
      field: "articles_id",
    },
  });

  assert.equal(payload.type, "alias");
  assert.equal(payload.schema, null);
  assert.deepEqual(payload.meta.special, ["o2m"]);
  assert.equal(payload.meta.interface, "translations");
});

test("builds translation and regular one-to-many relation metadata", () => {
  const translation = buildRelationPayload(
    "articles_translations",
    {
      name: "articles_id",
      type: "uuid",
      relatedCollection: "articles",
      oneField: "translations",
      translationRelation: true,
    },
  );
  const gallery = buildRelationPayload("product_images", {
    name: "product",
    type: "uuid",
    relatedCollection: "products",
    oneField: "gallery",
  });

  assert.equal(translation.meta.one_field, "translations");
  assert.equal(translation.meta.one_deselect_action, "delete");
  assert.equal(gallery.meta.one_field, "gallery");
  assert.equal(gallery.meta.one_deselect_action, "nullify");
});

test("recognizes a relative command path as the current main module", () => {
  assert.equal(
    isMainModule(
      "file:///D:/repo/directus/schema/apply-schema.mjs",
      "schema/apply-schema.mjs",
      "D:/repo/directus",
    ),
    true,
  );
});

test("checks string-key seeds through a filtered collection query", async () => {
  const calls = [];
  const client = {
    async request(path, options = {}) {
      calls.push({ path, method: options.method ?? "GET" });
      if (path === "/collections" || path === "/relations") return [];
      if (path.startsWith("/items/languages?")) return [];
      if (path === "/items/languages" && options.method === "POST") {
        return { code: "ru-RU" };
      }
      throw new Error(`unexpected request: ${path}`);
    },
  };

  const actions = await applyBlueprint(client, {
    collections: [],
    seed: {
      languages: [{ code: "ru-RU", name: "Русский", direction: "ltr" }],
    },
  });

  assert.deepEqual(actions, ["seed languages.ru-RU"]);
  assert.ok(
    calls.some(
      ({ path }) =>
        path ===
        "/items/languages?filter%5Bcode%5D%5B_eq%5D=ru-RU&limit=1&fields=code",
    ),
  );
});
