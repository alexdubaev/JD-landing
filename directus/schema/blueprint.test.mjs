import test from "node:test";
import assert from "node:assert/strict";

import { schemaBlueprint } from "./blueprint.mjs";

const requiredCollections = [
  "group_site",
  "group_catalog",
  "group_content",
  "group_sales",
  "group_settings",
  "site_settings",
  "home_page",
  "pages",
  "page_sections",
  "navigation_items",
  "categories",
  "articles",
  "products",
  "faq_items",
  "lead_forms",
  "leads",
  "testimonials",
  "banners",
  "hero_blocks",
  "advantages",
  "cta_blocks",
  "contact_channels",
  "recent_supplies",
  "seo_text_blocks",
  "product_images",
  "product_specifications",
  "product_documents",
  "seo_redirects",
  "orders",
  "order_items",
];

const requiredProductFields = [
  "id",
  "status",
  "title",
  "slug",
  "sku",
  "category",
  "short_description",
  "full_description",
  "seo_text",
  "main_image",
  "gallery",
  "price",
  "price_status",
  "availability_status",
  "specifications",
  "documents",
  "seo_title",
  "seo_description",
  "og_image",
  "image_alt",
  "sort_order",
  "is_featured",
  "show_on_homepage",
  "cta_text",
  "related_products",
  "lead_form",
  "brand",
  "part_type",
  "delivery_status",
  "created_at",
  "updated_at",
];

test("uses the normalized Directus content and catalog model", () => {
  const names = schemaBlueprint.collections.map(({ name }) => name);
  assert.deepEqual(names, requiredCollections);
  assert.equal(names.length, 30);
});

test("defines task folders and an editable homepage singleton", () => {
  const folders = schemaBlueprint.collections.filter(({ folder }) => folder);
  assert.deepEqual(
    folders.map(({ name }) => name),
    ["group_site", "group_catalog", "group_content", "group_sales", "group_settings"],
  );

  const homepage = schemaBlueprint.collections.find(({ name }) => name === "home_page");
  assert.equal(homepage.singleton, true);
  const fields = new Set(homepage.fields.map(({ name }) => name));
  for (const field of [
    "id", "status", "source_page", "h1", "hero_title", "hero_text",
    "hero_image", "hero_image_alt", "hero_primary_button_text",
    "hero_primary_button_url", "hero_secondary_button_text",
    "hero_secondary_button_url", "hero_search_label", "hero_search_placeholder",
    "hero_search_button_text", "hero_bulk_prompt", "hero_bulk_link_text",
    "hero_bulk_link_url", "hero_excel_link_text", "hero_excel_link_url",
    "hero_photo_link_text", "hero_photo_link_url", "seo_title", "seo_description",
    "canonical_url", "og_title", "og_description", "og_image", "is_indexable", "sections",
    "translations", "created_at", "updated_at",
  ]) {
    assert.ok(fields.has(field), `missing home_page.${field}`);
  }
  const homepageSections = homepage.fields.find(({ name }) => name === "sections");
  assert.equal(homepageSections.type, "alias");
  assert.deepEqual(homepageSections.special, ["o2m"]);

  const sections = schemaBlueprint.collections.find(({ name }) => name === "page_sections");
  const homeRelation = sections.fields.find(({ name }) => name === "home_page");
  assert.equal(homeRelation.relatedCollection, "home_page");
  assert.equal(homeRelation.oneField, "sections");
  assert.ok(sections.fields.some(({ name }) => name === "image_alt"));
});

test("stores factual company fields and translation-ready recent supplies", () => {
  const settings = schemaBlueprint.collections.find(({ name }) => name === "site_settings");
  const settingFields = new Set(settings.fields.map(({ name }) => name));
  for (const field of ["legal_name", "vat_info", "requisites_url", "documents_url", "company_image", "city", "inn", "kpp", "ogrn", "legal_address"]) {
    assert.ok(settingFields.has(field), `missing site_settings.${field}`);
  }
  const supplies = schemaBlueprint.collections.find(({ name }) => name === "recent_supplies");
  const supplyFields = new Set(supplies.fields.map(({ name }) => name));
  for (const field of ["status", "image", "image_alt", "equipment_type", "positions", "region", "delivery_term", "supply_format", "supplied_at", "sort_order", "translations"]) {
    assert.ok(supplyFields.has(field), `missing recent_supplies.${field}`);
  }
});

test("seeds the DEERE-SHOP singleton brand settings", () => {
  const settings = schemaBlueprint.seed.site_settings;

  assert.equal(settings.length, 1);
  assert.equal(settings[0].id, "5a4216d9-6fb1-4a1a-93fd-62b5ec90fa30");
  assert.equal(settings[0].company_name, "DEERE-SHOP");
  assert.equal(settings[0].primary_color, "#4C8F2B");
  assert.equal(settings[0].accent_color, "#FFC107");
});

test("keeps editorial collections translation-ready without junction tables", () => {
  const translatable = [
    "site_settings",
    "home_page",
    "pages",
    "page_sections",
    "navigation_items",
    "categories",
    "articles",
    "products",
    "faq_items",
    "lead_forms",
    "testimonials",
    "banners",
    "hero_blocks",
    "advantages",
    "cta_blocks",
    "contact_channels",
    "recent_supplies",
    "seo_text_blocks",
    "product_images",
    "product_specifications",
    "product_documents",
  ];

  for (const name of translatable) {
    const collection = schemaBlueprint.collections.find(
      (item) => item.name === name,
    );
    const translations = collection.fields.find(
      (field) => field.name === "translations",
    );
    assert.equal(translations?.type, "json", `${name}.translations`);
  }
});

test("categories expose dedicated compact icon fields", () => {
  const categories = schemaBlueprint.collections.find(
    ({ name }) => name === "categories",
  );
  const fields = new Set(categories.fields.map(({ name }) => name));
  assert.ok(fields.has("icon"));
  assert.ok(fields.has("icon_alt"));
});

test("articles contain publishing, cover, content and SEO fields", () => {
  const articles = schemaBlueprint.collections.find(
    ({ name }) => name === "articles",
  );
  const fields = new Set(articles.fields.map(({ name }) => name));
  for (const field of [
    "status",
    "title",
    "slug",
    "excerpt",
    "content",
    "cover_image",
    "image_alt",
    "published_at",
    "category_label",
    "reading_time_minutes",
    "is_featured",
    "sort_order",
    "seo_title",
    "seo_description",
    "og_image",
    "translations",
    "created_at",
    "updated_at",
  ]) {
    assert.ok(fields.has(field), `missing articles.${field}`);
  }
});

test("products contain every catalog, media, SEO, and lead field", () => {
  const products = schemaBlueprint.collections.find(
    ({ name }) => name === "products",
  );
  const fields = new Set(products.fields.map(({ name }) => name));

  for (const field of requiredProductFields) {
    assert.ok(fields.has(field), `missing products.${field}`);
  }
});

test("all declared relation targets exist", () => {
  const names = new Set(schemaBlueprint.collections.map(({ name }) => name));

  for (const collection of schemaBlueprint.collections) {
    for (const field of collection.fields) {
      if (!field.relatedCollection) continue;
      assert.ok(
        names.has(field.relatedCollection) ||
          field.relatedCollection.startsWith("directus_"),
        `${collection.name}.${field.name} targets unknown collection ${field.relatedCollection}`,
      );
    }
  }
});

test("leads capture contact, context, attribution, and sales workflow fields", () => {
  const leads = schemaBlueprint.collections.find(({ name }) => name === "leads");
  const fields = new Set(leads.fields.map(({ name }) => name));
  const required = [
    "name",
    "phone",
    "email",
    "message",
    "product",
    "category",
    "page_url",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "request_items",
    "attachments",
    "created_at",
    "status",
    "manager_comment",
  ];

  for (const name of required) {
    assert.ok(fields.has(name), `missing leads.${name}`);
  }
});

test("SEO data lives with pages, categories, and products", () => {
  for (const name of ["pages", "categories", "products"]) {
    const collection = schemaBlueprint.collections.find(
      (item) => item.name === name,
    );
    const fields = new Set(collection.fields.map((field) => field.name));
    for (const field of [
      "h1",
      "seo_title",
      "seo_description",
      "seo_text",
      "og_image",
    ]) {
      if (name === "products" && field === "h1") continue;
      assert.ok(fields.has(field), `missing ${name}.${field}`);
    }
  }
});
