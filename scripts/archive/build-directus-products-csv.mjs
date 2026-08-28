import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SOURCE = resolve(
  ROOT,
  "outputs/deere-supplier-import-2026-08-12/catalog-products-import.csv",
);
const DESTINATION = resolve(
  ROOT,
  "outputs/deere-supplier-import-2026-08-12/directus-products-import.csv",
);
const ENV_PATH = resolve(ROOT, "frontend/.env.local");

const directusFields = [
  "status",
  "category",
  "title",
  "slug",
  "sku",
  "price",
  "currency",
  "price_status",
  "availability_status",
  "short_description",
  "full_description",
  "brand",
  "mpn",
  "gtin",
  "part_type",
  "delivery_status",
  "source_name",
  "source_url",
  "verified_at",
  "seo_title",
  "seo_description",
  "image_alt",
  "seo_quality_status",
  "is_indexable",
  "sort_order",
  "popularity_score",
  "is_featured",
  "show_on_homepage",
  "cta_text",
];

function parseCsv(input) {
  const rows = [];
  let field = "";
  let row = [];
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];

    if (quoted) {
      if (character === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function toRecords(csv) {
  const [header, ...rows] = parseCsv(csv);
  return rows.filter((row) => row.some(Boolean)).map((row) =>
    Object.fromEntries(header.map((name, index) => [name, row[index] ?? ""])),
  );
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(records) {
  return [
    directusFields.join(","),
    ...records.map((record) =>
      directusFields.map((field) => csvCell(record[field])).join(","),
    ),
    "",
  ].join("\n");
}

function parseEnv(input) {
  return Object.fromEntries(
    input
      .split(/\r?\n/u)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

async function getDirectusItems(environment, collection, fields) {
  const response = await fetch(
    `${environment.DIRECTUS_URL}/items/${collection}?limit=-1&fields=${encodeURIComponent(fields)}`,
    { headers: { Authorization: `Bearer ${environment.DIRECTUS_TOKEN}` } },
  );
  if (!response.ok) {
    throw new Error(`Directus ${collection} request failed: ${response.status}`);
  }
  const body = await response.json();
  return body.data;
}

async function main() {
  const [environmentFile, sourceFile] = await Promise.all([
    readFile(ENV_PATH, "utf8"),
    readFile(SOURCE, "utf8"),
  ]);
  const environment = parseEnv(environmentFile);
  const [categories, currentProducts] = await Promise.all([
    getDirectusItems(environment, "categories", "id,slug"),
    getDirectusItems(environment, "products", "sku"),
  ]);
  const categoryIdBySlug = new Map(
    categories.map((category) => [category.slug, category.id]),
  );
  const currentSkus = new Set(currentProducts.map((product) => product.sku));
  const sourceRecords = toRecords(sourceFile);
  const unknownCategorySlugs = new Set();
  const existingSkuConflicts = [];
  const duplicateSkus = new Set();
  const seenSkus = new Set();

  const records = sourceRecords.map((source) => {
    const category = categoryIdBySlug.get(source.category_slug);
    if (!category) unknownCategorySlugs.add(source.category_slug);
    if (currentSkus.has(source.sku)) existingSkuConflicts.push(source.sku);
    if (seenSkus.has(source.sku)) duplicateSkus.add(source.sku);
    seenSkus.add(source.sku);
    return {
      status: source.status,
      category,
      title: source.title,
      slug: source.slug,
      sku: source.sku,
      price: source.price,
      currency: source.currency,
      price_status: source.price_status,
      availability_status: source.availability_status,
      short_description: source.short_description,
      full_description: source.full_description,
      brand: source.brand,
      mpn: source.mpn,
      gtin: source.gtin,
      part_type: source.part_type,
      delivery_status: source.delivery_status,
      source_name: source.source_name,
      source_url: source.source_url,
      verified_at: source.verified_at,
      seo_title: source.seo_title,
      seo_description: source.seo_description,
      image_alt: source.image_alt,
      seo_quality_status: "pending",
      is_indexable: source.is_indexable,
      sort_order: source.sort_order,
      popularity_score: source.popularity_score,
      is_featured: source.is_featured,
      show_on_homepage: source.show_on_homepage,
      cta_text: source.cta_text,
    };
  });

  const requiredFields = [
    "title",
    "slug",
    "sku",
    "currency",
    "price_status",
    "availability_status",
    "seo_title",
    "seo_description",
    "image_alt",
  ];
  const missingCoreFields = requiredFields.filter((field) =>
    records.some((record) => !record[field]),
  );
  const invalidCategoryIds = records.filter(
    (record) =>
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
        record.category,
      ),
  );
  const nonRubPrices = records.filter((record) => record.currency !== "RUB");
  const truncatedDescriptions = records.filter((record) =>
    /(?:\\.\\.\\.|…)$/u.test(record.full_description),
  );

  if (
    unknownCategorySlugs.size ||
    existingSkuConflicts.length ||
    duplicateSkus.size ||
    missingCoreFields.length ||
    invalidCategoryIds.length ||
    nonRubPrices.length ||
    truncatedDescriptions.length
  ) {
    throw new Error(
      JSON.stringify({
        unknownCategorySlugs: [...unknownCategorySlugs],
        existingSkuConflicts,
        duplicateSkus: [...duplicateSkus],
        missingCoreFields,
        invalidCategoryIds: invalidCategoryIds.length,
        nonRubPrices: nonRubPrices.length,
        truncatedDescriptions: truncatedDescriptions.length,
      }),
    );
  }

  await writeFile(DESTINATION, `\uFEFF${toCsv(records)}`, "utf8");
  console.log(
    JSON.stringify(
      {
        destination: DESTINATION,
        records: records.length,
        categories: categoryIdBySlug.size,
        existingSkuConflicts: 0,
        duplicateSkus: 0,
        missingCoreFields: 0,
        invalidCategoryIds: 0,
        nonRubPrices: 0,
        truncatedDescriptions: 0,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
