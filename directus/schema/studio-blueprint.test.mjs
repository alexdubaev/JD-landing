import test from "node:test";
import assert from "node:assert/strict";

import { schemaBlueprint } from "./blueprint.mjs";
import { studioBlueprint } from "./studio-blueprint.mjs";

test("organizes visible collections into six Russian task folders", () => {
  assert.deepEqual(studioBlueprint.folders, {
    group_site: { label: "Сайт", icon: "web", sort: 1 },
    group_catalog: { label: "Каталог", icon: "inventory_2", sort: 2 },
    group_content: { label: "Контент", icon: "article", sort: 3 },
    group_sales: { label: "Продажи", icon: "request_quote", sort: 4 },
    group_settings: { label: "Настройки", icon: "settings", sort: 5 },
    group_seo: { label: "SEO", icon: "travel_explore", sort: 6 },
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

test("cuts product gallery editing over to the canonical image relation", () => {
  const productFields = studioBlueprint.fields.products.fields;
  assert.equal(productFields.gallery.interface, "list");
  assert.equal(productFields.gallery.hidden, true);
  assert.deepEqual(productFields.main_image.options, { crop: false });
  assert.equal(productFields.image_items.interface, "list-o2m");
  assert.equal(productFields.image_items.hidden, false);
  assert.deepEqual(productFields.image_items.options, {
    layout: "list",
    template: "{{image}} {{alt_text}}",
    enableCreate: true,
    enableSelect: false,
    limit: 15,
  });
  assert.equal(productFields.specifications.interface, "list");
  assert.equal(productFields.documents.interface, "list");
});

test("keeps the non-gallery R7C child-collection aliases hidden", () => {
  const productFields = studioBlueprint.fields.products.fields;

  const aliases = {
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

  assert.equal(productFields.image_items.group, "group_media");
  assert.match(productFields.image_items.note ?? "", /product_images/);
});

test("products_analogs is an editable catalog collection", () => {
  assert.deepEqual(studioBlueprint.collections.products_analogs, {
    label: "Аналоги товаров",
    group: "group_catalog",
    icon: "compare_arrows",
    sort: 4,
    hidden: false,
    displayTemplate: "{{relation_type}} · {{product_from.sku}} → {{product_to.sku}}",
  });
});

test("wires the R8 analog aliases hidden in a dedicated products group", () => {
  const productForm = studioBlueprint.fields.products;

  assert.ok(productForm.groups.group_analogs, "missing products group_analogs");
  assert.equal(productForm.groups.group_analogs.label, "Аналоги");

  const productFields = productForm.fields;
  for (const field of ["analogs_from", "analogs_to"]) {
    assert.ok(productFields[field], `missing products form entry ${field}`);
    assert.equal(productFields[field].interface, "list-o2m", `${field} is an O2M list`);
    assert.equal(productFields[field].hidden, true, `${field} stays hidden`);
    assert.equal(productFields[field].group, "group_analogs", `${field} group`);
    assert.match(productFields[field].note ?? "", /products_analogs/, `${field} points editors at the junction collection`);
  }

  // The legacy related_products JSON interface stays untouched until the
  // gated cutover re-confirms it is empty.
  assert.equal(productFields.related_products.hidden, undefined);
  assert.equal(productFields.related_products.interface, undefined);
});

test("seo_work_items is a visible SEO-grouped collection with a complete grouped form", () => {
  assert.deepEqual(studioBlueprint.collections.seo_work_items, {
    label: "SEO-задачи",
    group: "group_seo",
    icon: "checklist",
    sort: 1,
    hidden: false,
    displayTemplate: "{{type}} · {{title}} · {{status}} · {{severity}}",
  });

  const layout = studioBlueprint.fields.seo_work_items;
  const schemaCollection = schemaBlueprint.collections.find(
    ({ name }) => name === "seo_work_items",
  );

  // The form covers the complete schema — same completeness contract as the
  // owner workflows above.
  assert.deepEqual(
    Object.keys(layout.fields).sort(),
    schemaCollection.fields.map(({ name }) => name).sort(),
    "seo_work_items form covers its complete schema",
  );
  for (const [field, config] of Object.entries(layout.fields)) {
    assert.ok(config.group, `seo_work_items.${field} is ungrouped`);
    assert.ok(layout.groups[config.group], `seo_work_items.${field} group exists`);
    assert.ok(config.width, `seo_work_items.${field} width`);
  }

  // Reviewers triage the queue from the first group; worker bookkeeping is
  // closed away and read-only.
  assert.equal(layout.fields.status.group, "group_main");
  assert.equal(layout.fields.severity.group, "group_main");
  assert.equal(layout.fields.article.group, "group_entity");
  assert.equal(layout.fields.patch_json.group, "group_recommendation");
  assert.equal(layout.fields.evidence_json.group, "group_evidence");
  for (const field of ["claimed_at", "expires_at", "applied_at", "rolled_back_at", "last_error"]) {
    assert.equal(layout.fields[field].group, "group_pipeline", `${field} group`);
    assert.equal(layout.fields[field].readonly, true, `${field} stays read-only for humans`);
  }

  // Worker-computed keys are visible for debugging but never hand-edited.
  for (const field of ["dedupe_key", "before_hash"]) {
    assert.equal(layout.fields[field].readonly, true, `${field} stays read-only`);
  }
});

test("wires the seo-plugin JSON panel into the SEO group of the five content collections", () => {
  for (const collection of ["home_page", "pages", "categories", "products", "articles"]) {
    const layout = studioBlueprint.fields[collection];
    const field = layout.fields.seo;
    assert.ok(field, `missing ${collection} form entry seo`);
    assert.equal(field.group, "group_seo", `${collection}.seo group`);
    assert.equal(field.interface, "seo-interface", `${collection}.seo interface`);
    assert.equal(field.display, "seo-display", `${collection}.seo display`);
    assert.equal(field.width, "full", `${collection}.seo width`);
    assert.match(
      field.note ?? "",
      /JSON/i,
      `${collection}.seo documents the JSON-first/scalar-fallback rule`,
    );
    // The legacy scalar fields stay editable in the SAME group — the plugin
    // panel only adds a surface, it never replaces the scalars.
    for (const scalar of ["seo_title", "seo_description", "og_image"]) {
      assert.ok(layout.fields[scalar], `missing ${collection}.${scalar}`);
      assert.equal(layout.fields[scalar].group, "group_seo");
    }
  }
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
