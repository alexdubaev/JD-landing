import test from "node:test";
import assert from "node:assert/strict";

import { schemaBlueprint } from "./blueprint.mjs";
import { studioBlueprint } from "./studio-blueprint.mjs";

test("organizes visible collections into five Russian task folders", () => {
  assert.deepEqual(studioBlueprint.folders, {
    group_site: { label: "Сайт", icon: "web", sort: 1 },
    group_catalog: { label: "Каталог", icon: "inventory_2", sort: 2 },
    group_content: { label: "Контент", icon: "article", sort: 3 },
    group_sales: { label: "Продажи", icon: "request_quote", sort: 4 },
    group_settings: { label: "Настройки", icon: "settings", sort: 5 },
  });

  assert.deepEqual(studioBlueprint.collections.home_page, {
    label: "Главная страница",
    group: "group_site",
    icon: "home",
    sort: 1,
    hidden: false,
    singleton: true,
  });
  assert.equal(studioBlueprint.collections.products.group, "group_catalog");
  assert.equal(studioBlueprint.collections.articles.group, "group_content");
  assert.equal(studioBlueprint.collections.leads.group, "group_sales");
  assert.equal(studioBlueprint.collections.site_settings.group, "group_settings");
});

test("hides technical collections from top-level navigation", () => {
  for (const key of [
    "page_sections",
    "articles_editor_nodes",
    "product_images",
    "product_specifications",
    "product_documents",
    "order_items",
    "contact_channels",
    "lead_forms",
    "seo_redirects",
  ]) {
    assert.equal(studioBlueprint.collections[key].hidden, true, key);
  }
});

test("the six decommissioned legacy collections are gone from the studio blueprint", () => {
  const keys = Object.keys(studioBlueprint.collections);
  for (const legacy of [
    "hero_blocks",
    "advantages",
    "cta_blocks",
    "seo_text_blocks",
    "banners",
    "testimonials",
  ]) {
    assert.ok(!keys.includes(legacy), `${legacy} must not appear in studio blueprint`);
  }
});

test("defines friendly homepage groups and repeaters", () => {
  const homepage = studioBlueprint.fields.home_page;
  assert.deepEqual(Object.keys(homepage.groups), [
    "group_main",
    "group_hero",
    "group_sections",
    "group_seo",
    "group_system",
  ]);
  assert.equal(homepage.fields.hero_image.group, "group_hero");
  assert.equal(homepage.fields.sections.interface, "list-o2m");
  assert.equal(studioBlueprint.fields.products.fields.specifications.interface, "list");
  assert.equal(studioBlueprint.fields.site_settings.fields.messengers.interface, "list");
  assert.equal(studioBlueprint.defaultLanguage, "ru-RU");
});

test("uses informative list display templates", () => {
  assert.equal(
    studioBlueprint.collections.products.displayTemplate,
    "{{title}} · {{sku}} · {{category.title}} · {{availability_status}}",
  );
  assert.equal(
    studioBlueprint.collections.leads.displayTemplate,
    "{{name}} · {{phone}} · {{status}} · {{created_at}}",
  );
});

test("defines task-oriented forms for every owner workflow", () => {
  const requiredForms = [
    "home_page",
    "pages",
    "products",
    "categories",
    "articles",
    "faq_items",
    "leads",
    "orders",
    "site_settings",
  ];

  for (const collection of requiredForms) {
    const layout = studioBlueprint.fields[collection];
    const schemaCollection = schemaBlueprint.collections.find(
      ({ name }) => name === collection,
    );
    assert.ok(layout, `missing ${collection} form`);
    assert.ok(Object.keys(layout.groups).length >= 2, `${collection} groups`);
    assert.ok(Object.keys(layout.fields).length >= 3, `${collection} fields`);
    assert.deepEqual(
      Object.keys(layout.fields).sort(),
      schemaCollection.fields.map(({ name }) => name).sort(),
      `${collection} form covers its complete schema`,
    );
    for (const [field, config] of Object.entries(layout.fields)) {
      assert.ok(config.group, `${collection}.${field} is ungrouped`);
      assert.ok(layout.groups[config.group], `${collection}.${field} group exists`);
      assert.ok(config.width, `${collection}.${field} width`);
    }
  }

  assert.equal(studioBlueprint.fields.pages.fields.slug.group, "group_main");
  assert.equal(studioBlueprint.fields.categories.fields.slug.group, "group_main");
  assert.equal(studioBlueprint.fields.articles.fields.slug.group, "group_main");
  assert.equal(studioBlueprint.fields.leads.fields.manager_comment.group, "group_workflow");
  assert.equal(studioBlueprint.fields.orders.fields.manager_comment.group, "group_workflow");
});

test("keeps legacy product JSON interfaces until the dual-read migration", () => {
  const productFields = studioBlueprint.fields.products.fields;
  assert.equal(productFields.gallery.interface, "list");
  assert.equal(productFields.specifications.interface, "list");
  assert.equal(productFields.documents.interface, "list");
});

test("wires the R7C child-collection aliases hidden until the cutover gate", () => {
  const productFields = studioBlueprint.fields.products.fields;

  const aliases = {
    image_items: "group_media",
    document_items: "group_media",
    specification_items: "group_specs",
  };
  for (const [field, group] of Object.entries(aliases)) {
    assert.ok(productFields[field], `missing products form entry ${field}`);
    assert.equal(productFields[field].interface, "list-o2m", `${field} is an O2M list`);
    assert.equal(productFields[field].hidden, true, `${field} stays hidden until R7C`);
    assert.equal(productFields[field].group, group, `${field} group`);
    assert.match(productFields[field].note ?? "", /R7C/, `${field} documents the gate`);
  }

  // Legacy JSON interfaces stay editable "list" repeaters until the gate
  // (asserted above) — the aliases only ADD the canonical editing surface.
  assert.equal(productFields.gallery.readonly, undefined);
});

test("articles form wires the flexible editor with a hidden M2A alias in the same group", () => {
  const articles = studioBlueprint.fields.articles.fields;

  assert.equal(articles.content_blocks.interface, "flexible-editor");
  assert.equal(articles.content_blocks.options.m2aField, "editor_nodes");
  assert.equal(articles.content_blocks.options.tools.includes("h1"), false);
  assert.deepEqual(
    articles.content_blocks.options.relationBlocks,
    ["products", "categories"],
  );

  assert.equal(articles.editor_nodes.hidden, true);
  // The extension loses the M2A connection unless both fields share a group.
  assert.equal(
    articles.editor_nodes.group,
    articles.content_blocks.group,
    "editor_nodes must sit in the same group as content_blocks",
  );
  assert.equal(articles.content_blocks.group, "group_content");
});
