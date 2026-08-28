import { readFile } from "node:fs/promises";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run") || process.env.DIRECTUS_IMPORT_DRY_RUN === "1";
const statusArgument = [...args].find((argument) =>
  argument.startsWith("--status="),
);
const requestedStatus = statusArgument?.split("=").at(1) ?? "draft";
const inputArgument = [...args].find((argument) =>
  argument.startsWith("--input="),
);
const inputPath = inputArgument?.split("=").slice(1).join("=");
const directusUrl = process.env.DIRECTUS_URL?.replace(/\/+$/u, "");
const directusToken = process.env.DIRECTUS_TOKEN;
const minimumCreateIntervalMs = 30;
const categorySlugAliases = new Map([
  ["krepezh-i-krepleniya", "krepezh"],
]);

if (!inputPath) throw new Error("Pass --input=/absolute/path/to/products.csv");
if (!directusUrl) throw new Error("Set DIRECTUS_URL");
if (!directusToken) throw new Error("Set DIRECTUS_TOKEN");
if (!new Set(["draft", "published"]).has(requestedStatus)) {
  throw new Error("--status must be draft or published");
}

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
    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") field += character;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function readRecords(csv) {
  const [header, ...rows] = parseCsv(csv);
  const normalizedHeader = header.map((value) => value.replace(/^\uFEFF/u, ""));
  return rows
    .filter((row) => row.some(Boolean))
    .map((row) =>
      Object.fromEntries(
        normalizedHeader.map((name, index) => [name, row[index] ?? ""]),
      ),
    );
}

async function request(path, options = {}) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await fetch(`${directusUrl}${path}`, {
      ...options,
      headers: {
        authorization: `Bearer ${directusToken}`,
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...options.headers,
      },
    });
    if (response.ok) {
      const payload = await response.json();
      return payload.data;
    }
    const body = await response.text();
    if (response.status === 429 && attempt < 7) {
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      continue;
    }
    throw new Error(
      `${options.method ?? "GET"} ${path} failed: ${response.status} ${body}`,
    );
  }
  throw new Error(`${options.method ?? "GET"} ${path} exceeded retry limit`);
}

const asBoolean = (value) => value === true || value === "true";
const nullable = (value) => (value === "" ? null : value);

function productPayload(source, categoryId) {
  return {
    status: requestedStatus,
    category: categoryId,
    title: source.title,
    slug: source.slug,
    sku: source.sku,
    price: source.price === "" ? null : source.price,
    currency: source.currency,
    price_status: source.price_status,
    availability_status: source.availability_status,
    short_description: nullable(source.short_description),
    full_description: nullable(source.full_description),
    brand: nullable(source.brand),
    mpn: nullable(source.mpn),
    gtin: nullable(source.gtin),
    part_type: nullable(source.part_type),
    delivery_status: nullable(source.delivery_status),
    source_name: nullable(source.source_name),
    source_url: nullable(source.source_url),
    verified_at: nullable(source.verified_at),
    seo_title: nullable(source.seo_title),
    seo_description: nullable(source.seo_description),
    image_alt: nullable(source.image_alt),
    seo_quality_status: "pending",
    is_indexable: asBoolean(source.is_indexable),
    sort_order: Number(source.sort_order || 0),
    popularity_score: Number(source.popularity_score || 0),
    is_featured: asBoolean(source.is_featured),
    show_on_homepage: asBoolean(source.show_on_homepage),
    cta_text: nullable(source.cta_text),
  };
}

function resolvedCategorySlug(source) {
  return categorySlugAliases.get(source.category_slug) ?? source.category_slug;
}

function collectDuplicates(records, field) {
  const seen = new Set();
  const duplicates = new Set();
  for (const record of records) {
    const value = record[field];
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

async function runPool(items, concurrency, task) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        await task(items[index], index);
      }
    }),
  );
}

async function main() {
  const records = readRecords(await readFile(inputPath, "utf8"));
  const required = [
    "category_slug",
    "category_title",
    "title",
    "slug",
    "sku",
    "currency",
    "price_status",
    "availability_status",
  ];
  const missingFields = required.filter((field) =>
    records.some((record) => !record[field]),
  );
  const duplicateSkus = collectDuplicates(records, "sku");
  const duplicateSlugs = collectDuplicates(records, "slug");
  if (missingFields.length || duplicateSkus.length || duplicateSlugs.length) {
    throw new Error(
      JSON.stringify({ missingFields, duplicateSkus, duplicateSlugs }),
    );
  }

  const [categories, products] = await Promise.all([
    request("/items/categories?limit=-1&fields=id,slug,title"),
    request("/items/products?limit=-1&fields=sku,slug"),
  ]);
  const categoryIdBySlug = new Map(categories.map(({ slug, id }) => [slug, id]));
  const existingSkus = new Set(products.map(({ sku }) => sku));
  const existingSlugs = new Set(products.map(({ slug }) => slug));
  const conflictingSlugs = records
    .filter(({ sku, slug }) => !existingSkus.has(sku) && existingSlugs.has(slug))
    .map(({ slug }) => slug);
  const recordsToImport = records.filter(({ sku }) => !existingSkus.has(sku));
  const missingCategories = [
    ...new Map(
      records
        .filter((source) => !categoryIdBySlug.has(resolvedCategorySlug(source)))
        .map((source) => [resolvedCategorySlug(source), source.category_title]),
    ),
  ];

  if (conflictingSlugs.length) {
    throw new Error(
      JSON.stringify({
        conflictingSlugs: [...new Set(conflictingSlugs)].sort(),
      }),
    );
  }

  console.log(
    JSON.stringify(
      {
        sourceRecords: records.length,
        existingProducts: products.length,
        skippedExistingSkus: records.length - recordsToImport.length,
        recordsToImport: recordsToImport.length,
        missingCategories: missingCategories.map(([slug]) => slug),
        dryRun,
        requestedStatus,
      },
      null,
      2,
    ),
  );
  if (dryRun) return;

  for (const [slug, title] of missingCategories) {
    const category = await request("/items/categories", {
      method: "POST",
      body: JSON.stringify({
        status: requestedStatus,
        title,
        slug,
        h1: title,
        image_alt: title,
        is_indexable: false,
      }),
    });
    categoryIdBySlug.set(slug, category.id);
  }

  let completed = 0;
  await runPool(recordsToImport, 1, async (source) => {
    await new Promise((resolve) => setTimeout(resolve, minimumCreateIntervalMs));
    await request("/items/products", {
      method: "POST",
      body: JSON.stringify(
        productPayload(source, categoryIdBySlug.get(resolvedCategorySlug(source))),
      ),
    });
    completed += 1;
    if (completed % 100 === 0 || completed === recordsToImport.length) {
      console.log(`Imported ${completed}/${recordsToImport.length}`);
    }
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
