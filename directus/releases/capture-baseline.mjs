import path from "node:path";

import { DirectusAdminClient, isMainModule } from "../schema/apply-schema.mjs";
import {
  assertArtifactDirectory,
  assertSafeArtifact,
  hashRows,
  writeArtifactsExclusive,
} from "./lib/artifacts.mjs";

const COLLECTION_FIELDS = {
  products: ["id", "status", "slug", "sku", "category", "main_image", "gallery"],
  categories: ["id", "status", "slug", "parent"],
  articles: ["id", "status", "slug"],
  pages: ["id", "status", "slug"],
  page_sections: ["id", "page", "home_page", "status"],
  faq_items: ["id", "page", "category", "product", "status"],
};

const METADATA_QUERIES = {
  collections: ["collection", "schema.name", "meta.hidden"],
  fields: ["collection", "field", "type", "meta.special"],
  relations: ["collection", "field", "related_collection", "meta.one_field", "meta.junction_field"],
  flows: ["id", "name", "status", "trigger", "accountability"],
  presets: ["id", "collection", "layout", "role"],
  permissions: ["id", "collection", "action", "fields", "policy"],
};

const relationId = (value) =>
  value && typeof value === "object" ? (value.id ?? null) : (value ?? null);

const galleryIds = (gallery) => {
  if (!Array.isArray(gallery)) return [];
  return gallery
    .map((value) => relationId(value?.directus_files_id ?? value))
    .filter(Boolean);
};

const buildQuery = (fields, { limit, offset = 0, sort = "id" } = {}) => {
  const query = new URLSearchParams({ fields: fields.join(",") });
  if (limit !== undefined) query.set("limit", String(limit));
  if (offset) query.set("offset", String(offset));
  if (sort) query.set("sort", sort);
  return query.toString();
};

async function readAllItems(client, collection, fields, pageSize) {
  const rows = [];
  for (let offset = 0; ; ) {
    const query = buildQuery(fields, { limit: pageSize, offset });
    const page = await client.request(`/items/${collection}?${query}`);
    if (page.length === 0) break;
    rows.push(...page);
    offset += page.length;
  }
  return rows;
}

const readAggregateCount = async (client, collection) => {
  const query = new URLSearchParams({ "aggregate[count]": "id" });
  const rows = await client.request(`/items/${collection}?${query.toString()}`);
  return Number(rows?.[0]?.count?.id ?? 0);
};

const pickMetadataFields = (row, fields) => {
  const picked = {};
  for (const field of fields) {
    const keys = field.split(".");
    const value = keys.reduce((current, key) => current?.[key], row);
    if (value === undefined) continue;
    let target = picked;
    for (const key of keys.slice(0, -1)) {
      target[key] ??= {};
      target = target[key];
    }
    target[keys.at(-1)] = value;
  }
  return picked;
};

const readMetadata = async (client, endpoint, fields) => {
  const query = buildQuery(fields, { limit: -1, sort: null });
  const rows = await client.request(`/${endpoint}?${query}`);
  return rows.map((row) => pickMetadataFields(row, fields));
};

const countBrokenRelations = ({
  products,
  categories,
  pageSections,
  pages,
  faqItems,
  homePageId,
}) => {
  const productIds = new Set(products.map(({ id }) => String(id)));
  const categoryIds = new Set(categories.map(({ id }) => String(id)));
  const pageIds = new Set(pages.map(({ id }) => String(id)));
  let broken = 0;

  for (const product of products) {
    const category = relationId(product.category);
    if (category && !categoryIds.has(String(category))) broken += 1;
  }
  for (const category of categories) {
    const parent = relationId(category.parent);
    if (parent && !categoryIds.has(String(parent))) broken += 1;
  }
  for (const section of pageSections) {
    const page = relationId(section.page);
    if (page && !pageIds.has(String(page))) broken += 1;
    const homePage = relationId(section.home_page);
    if (homePage && String(homePage) !== String(homePageId)) broken += 1;
  }
  for (const faq of faqItems) {
    const page = relationId(faq.page);
    const category = relationId(faq.category);
    const product = relationId(faq.product);
    if (page && !pageIds.has(String(page))) broken += 1;
    if (category && !categoryIds.has(String(category))) broken += 1;
    if (product && !productIds.has(String(product))) broken += 1;
  }
  return broken;
};

const metadataSummary = (rows) => ({ count: rows.length, sha256: hashRows(rows) });

export async function captureBaseline(
  client,
  { capturedAt = new Date().toISOString(), pageSize = 500 } = {},
) {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error("pageSize must be a positive integer");
  }

  const products = await readAllItems(client, "products", COLLECTION_FIELDS.products, pageSize);
  const categories = await readAllItems(client, "categories", COLLECTION_FIELDS.categories, pageSize);
  const articles = await readAllItems(client, "articles", COLLECTION_FIELDS.articles, pageSize);
  const pages = await readAllItems(client, "pages", COLLECTION_FIELDS.pages, pageSize);
  const pageSections = await readAllItems(client, "page_sections", COLLECTION_FIELDS.page_sections, pageSize);
  const faqItems = await readAllItems(client, "faq_items", COLLECTION_FIELDS.faq_items, pageSize);
  const homePage = await client.request("/items/home_page?fields=id");
  const homePageId = relationId(Array.isArray(homePage) ? homePage[0] : homePage);
  const leads = await readAggregateCount(client, "leads");
  const orders = await readAggregateCount(client, "orders");

  const metadataRows = {};
  for (const [endpoint, fields] of Object.entries(METADATA_QUERIES)) {
    metadataRows[endpoint] = await readMetadata(client, endpoint, fields);
  }

  const published = products.filter(({ status }) => status === "published").length;
  const gallery = products.map(({ gallery: value }) => galleryIds(value));
  const publishedCategories = categories
    .filter(({ status, slug }) => status === "published" && slug)
    .toSorted((a, b) => String(a.id).localeCompare(String(b.id), "en"));
  const publishedCategoryById = new Map(
    publishedCategories.map((category) => [String(category.id), category]),
  );
  const firstCategory = publishedCategories[0];
  const firstProduct = products
    .filter(({ status, slug, category }) =>
      status === "published" &&
      slug &&
      publishedCategoryById.has(String(relationId(category))),
    )
    .toSorted((a, b) => String(a.id).localeCompare(String(b.id), "en"))[0];
  const productCategoryId = relationId(firstProduct?.category);
  const productCategory = publishedCategoryById.get(String(productCategoryId));
  const firstArticle = articles
    .filter(({ status, slug }) => status === "published" && slug)
    .toSorted((a, b) => String(a.id).localeCompare(String(b.id), "en"))[0];

  const baseline = {
    version: 1,
    capturedAt,
    counts: {
      products: {
        total: products.length,
        published,
        galleryProducts: gallery.filter((ids) => ids.length > 0).length,
        galleryReferences: gallery.reduce((total, ids) => total + ids.length, 0),
        missingCategory: products.filter(({ category }) => !relationId(category)).length,
        missingMainImage: products.filter(({ main_image }) => !relationId(main_image)).length,
      },
      categories: categories.length,
      articles: articles.length,
      pages: pages.length,
      pageSections: pageSections.length,
      faqItems: faqItems.length,
      leads,
      orders,
      collectionCount: metadataRows.collections.filter(
        ({ collection, schema }) =>
          schema?.name && !String(collection).startsWith("directus_"),
      ).length,
    },
    hashes: {
      products: hashRows(products),
      categories: hashRows(categories),
      articles: hashRows(articles),
      pages: hashRows(pages),
      pageSections: hashRows(pageSections),
      faqItems: hashRows(faqItems),
    },
    metadata: Object.fromEntries(
      Object.entries(metadataRows).map(([name, rows]) => [name, metadataSummary(rows)]),
    ),
    details: {
      schema: {
        collections: metadataRows.collections,
        fields: metadataRows.fields,
      },
      relations: metadataRows.relations,
    },
    integrity: {
      brokenRelations: countBrokenRelations({
        products,
        categories,
        pageSections,
        pages,
        faqItems,
        homePageId,
      }),
    },
    redacted: {
      leads: { count: leads },
      orders: { count: orders },
    },
    routes: {
      category: firstCategory?.slug ? `/catalog/${firstCategory.slug}` : null,
      product:
        productCategory?.slug && firstProduct?.slug
          ? `/catalog/${productCategory.slug}/${firstProduct.slug}`
          : null,
      article: firstArticle?.slug ? `/articles/${firstArticle.slug}` : null,
    },
  };

  return assertSafeArtifact(baseline);
}

export function buildBaselineArtifactFiles(baseline, label) {
  if (!/^[a-z0-9_-]+$/i.test(label ?? "")) {
    throw new Error("Invalid baseline label");
  }
  return {
    [`baseline-${label}.json`]: baseline,
    [`counts-${label}.json`]: baseline.counts,
    [`relations-${label}.json`]: {
      integrity: baseline.integrity,
      relations: baseline.details.relations,
    },
    [`schema-${label}.json`]: baseline.details.schema,
  };
}

export function createReadOnlyClientFromEnvironment(env = process.env) {
  const token = env.DIRECTUS_READONLY_TOKEN?.trim();
  if (!token) throw new Error("Set DIRECTUS_READONLY_TOKEN for read-only baseline access");
  const rawUrl = env.DIRECTUS_URL ?? "http://127.0.0.1:8055";
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("DIRECTUS_URL must be an absolute HTTP(S) URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("DIRECTUS_URL must be an absolute HTTP(S) URL");
  }
  return new DirectusAdminClient(url.toString(), token);
}

const argumentValue = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
};

async function main() {
  const outputDirectory = argumentValue("output") ?? process.env.JD_RELEASE_DIR;
  const label = argumentValue("label") ?? "before";
  if (!outputDirectory) throw new Error("Set --output or JD_RELEASE_DIR");
  if (!/^[a-z0-9_-]+$/i.test(label)) throw new Error("Invalid baseline label");

  const repositoryRoot = path.resolve(import.meta.dirname, "../..");
  const directory = await assertArtifactDirectory(outputDirectory, {
    repositoryRoot,
    scanExistingFiles: true,
  });
  const client = createReadOnlyClientFromEnvironment();
  const baseline = await captureBaseline(client);
  const artifacts = buildBaselineArtifactFiles(baseline, label);
  await writeArtifactsExclusive(directory, artifacts);
  console.log(`Wrote read-only Directus baseline artifacts to ${directory}`);
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
