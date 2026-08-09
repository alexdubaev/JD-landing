import test from "node:test";
import assert from "node:assert/strict";

import { schemaBlueprint } from "./blueprint.mjs";
import {
  collectionTranslations,
  fieldTranslations,
  getChoiceTranslations,
  getFieldTranslation,
} from "./ui-translations.mjs";
import { applyUiTranslations } from "./apply-ui-translations.mjs";

test("covers every project collection with a Russian Data Studio name", () => {
  for (const collection of schemaBlueprint.collections) {
    assert.ok(collectionTranslations[collection.name], collection.name);
  }
});

test("covers every declared field with a Russian Data Studio label", () => {
  for (const collection of schemaBlueprint.collections) {
    for (const field of collection.fields) {
      assert.ok(fieldTranslations[field.name], `${collection.name}.${field.name}`);
    }
  }
});

test("builds Directus-compatible Russian translation metadata", () => {
  assert.deepEqual(getFieldTranslation("products", "sku"), [
    { language: "ru-RU", translation: "Артикул (SKU)" },
  ]);
  assert.deepEqual(
    getChoiceTranslations("availability_status", [
      { text: "in stock", value: "in_stock" },
      { text: "on request", value: "on_request" },
    ]),
    [
      { text: "В наличии", value: "in_stock" },
      { text: "Под заказ", value: "on_request" },
    ],
  );
});

test("applies collection and field translations idempotently", async () => {
  const requests = [];
  const client = {
    async request(path, options = {}) {
      requests.push({ path, method: options.method ?? "GET", body: options.body });
      if (path === "/collections") {
        return [
          {
            collection: "products",
            meta: { translations: null },
          },
        ];
      }
      if (path === "/fields/products") {
        return [
          {
            field: "sku",
            meta: {
              translations: null,
              options: null,
            },
          },
        ];
      }
      return {};
    },
  };

  const actions = await applyUiTranslations(client, { dryRun: false });
  assert.ok(actions.includes("translate collection products -> Товары"));
  assert.ok(actions.includes("translate field products.sku -> Артикул (SKU)"));
  assert.ok(
    requests.some(
      (request) =>
        request.path === "/collections/products" && request.method === "PATCH",
    ),
  );
  assert.ok(
    requests.some(
      (request) =>
        request.path === "/fields/products/sku" && request.method === "PATCH",
    ),
  );
});

