import test from "node:test";
import assert from "node:assert/strict";

import { schemaBlueprint } from "../schema/blueprint.mjs";
import { workspaceBlueprint } from "./workspace-blueprint.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("defines project-owned bookmarks with useful list columns", () => {
  const keys = workspaceBlueprint.presets.map(({ key }) => key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.every((key) => key.startsWith("deere-shop:")));

  const byCollection = new Map(
    workspaceBlueprint.presets.map((preset) => [preset.collection, preset]),
  );
  for (const collection of [
    "products",
    "categories",
    "articles",
    "faq_items",
    "leads",
    "orders",
  ]) {
    const preset = byCollection.get(collection);
    assert.ok(preset, `missing ${collection} bookmark`);
    assert.match(preset.bookmark, /^Deere Shop · /);
    assert.equal(preset.layout, "tabular");
    assert.equal(preset.layoutOptions.deereShopKey, preset.key);
    assert.ok(preset.layoutQuery.tabular.fields.length >= 3);
    assert.equal("user" in preset, false);
    assert.equal("role" in preset, false);
  }

  assert.deepEqual(byCollection.get("products").layoutQuery.tabular.fields, [
    "title",
    "sku",
    "category",
    "availability_status",
    "status",
    "updated_at",
  ]);
  assert.deepEqual(byCollection.get("leads").layoutQuery.tabular.fields, [
    "created_at",
    "name",
    "phone",
    "product",
    "status",
  ]);
});

test("defines one deterministic operational dashboard with native panels", () => {
  const { dashboard, panels } = workspaceBlueprint;
  assert.equal(dashboard.key, "deere-shop:dashboard:operations");
  assert.match(dashboard.id, UUID_PATTERN);
  assert.equal(dashboard.name, "Deere Shop · Контроль контента и продаж");
  assert.ok(panels.length >= 5);
  assert.equal(new Set(panels.map(({ id }) => id)).size, panels.length);

  const projectCollections = new Set(
    schemaBlueprint.collections.filter(({ folder }) => !folder).map(({ name }) => name),
  );
  for (const panel of panels) {
    assert.match(panel.id, UUID_PATTERN, panel.key);
    assert.equal(panel.dashboard, dashboard.id);
    assert.ok(["metric", "list"].includes(panel.type), panel.key);
    assert.ok(projectCollections.has(panel.options.collection), panel.key);
    assert.equal(panel.note, panel.key);
    assert.ok(Number.isInteger(panel.positionX));
    assert.ok(Number.isInteger(panel.positionY));
    assert.ok(Number.isInteger(panel.width));
    assert.ok(Number.isInteger(panel.height));
    if (panel.type === "metric") {
      assert.equal(panel.options.function, "count");
      assert.equal(panel.options.field, "id");
    } else {
      assert.equal("fields" in panel.options, false);
      assert.equal("sort" in panel.options, false);
      assert.match(panel.options.displayTemplate, /{{[^}]+}}/);
      assert.equal(typeof panel.options.sortField, "string");
      assert.ok(["asc", "desc"].includes(panel.options.sortDirection));
      assert.ok(panel.options.limit > 0);
    }
  }

  assert.ok(panels.some(({ key }) => key === "deere-shop:leads:unprocessed"));
  assert.ok(panels.some(({ key }) => key === "deere-shop:products:missing-image"));
});

test("filters empty product images through the related file primary key", () => {
  const panel = workspaceBlueprint.panels.find(
    ({ key }) => key === "deere-shop:products:missing-image",
  );

  assert.deepEqual(panel.options.filter, {
    main_image: { id: { _null: true } },
  });
});
