import test from "node:test";
import assert from "node:assert/strict";

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

test("hides technical and legacy collections from top-level navigation", () => {
  for (const key of [
    "page_sections",
    "product_images",
    "product_specifications",
    "product_documents",
    "order_items",
    "contact_channels",
    "hero_blocks",
    "advantages",
    "cta_blocks",
    "seo_text_blocks",
    "banners",
    "testimonials",
    "lead_forms",
    "seo_redirects",
  ]) {
    assert.equal(studioBlueprint.collections[key].hidden, true, key);
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
    "{{title}} · {{sku}} · {{availability_status}}",
  );
  assert.equal(
    studioBlueprint.collections.leads.displayTemplate,
    "{{name}} · {{phone}} · {{status}} · {{created_at}}",
  );
});
