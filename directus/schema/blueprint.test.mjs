import test from "node:test";
import assert from "node:assert/strict";

import { schemaBlueprint } from "./blueprint.mjs";

const requiredCollections = [
  "site_settings",
  "pages",
  "page_sections",
  "navigation_items",
  "categories",
  "products",
  "faq_items",
  "lead_forms",
  "leads",
  "testimonials",
  "banners",
  "seo_redirects",
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
  "created_at",
  "updated_at",
];

test("uses the approved 12-collection Directus model", () => {
  const names = schemaBlueprint.collections.map(({ name }) => name);
  assert.deepEqual(names, requiredCollections);
  assert.equal(names.length, 12);
  assert.ok(names.length <= 25);
});

test("keeps editorial collections translation-ready without junction tables", () => {
  const translatable = [
    "site_settings",
    "pages",
    "page_sections",
    "navigation_items",
    "categories",
    "products",
    "faq_items",
    "lead_forms",
    "testimonials",
    "banners",
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
