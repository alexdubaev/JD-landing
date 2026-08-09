#!/usr/bin/env node
/**
 * Import validation for John Deere product catalog.
 *
 * Flags records that require manual review before publishing:
 *  - duplicate "John Deere" or SKU in title
 *  - empty/truncated title
 *  - title fragments like `4")` without a subject name
 *  - incorrect casing
 *  - empty indexable category
 *  - indexable product missing minimum data
 *  - visible price / schema mismatch
 *  - placeholder or unverified values
 *
 * Usage:
 *   node scripts/validate-import.mjs [path-to-products.json] [path-to-categories.json]
 *
 * If no arguments provided, reads from:
 *   outputs/jd-product-import-2026-07-28/products.json
 *   outputs/jd-product-import-2026-07-28/categories.json
 *
 * Output: Markdown report to stdout and `outputs/import-validation-report.md`.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Не удалось прочитать ${label}: ${path}. ${reason}`);
  }
}

const productsPath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(ROOT, "outputs/jd-product-import-2026-07-28/products.json");
const categoriesPath = process.argv[3]
  ? resolve(process.argv[3])
  : resolve(ROOT, "outputs/jd-product-import-2026-07-28/categories.json");

const products = readJson(productsPath, "файл товаров");
const categories = readJson(categoriesPath, "файл категорий");

/** @type {Array<{severity:string,code:string,message:string,record?:object}>} */
const issues = [];

const isIndexable = (r) => r?.status === "published" && r?.is_indexable !== false;

// --- Product validation ---------------------------------------------------

const seenSkus = new Map();
const seenSlugs = new Map();

for (const product of products) {
  const title = String(product?.title ?? "").trim();
  const sku = String(product?.sku ?? "").trim();
  const slug = String(product?.slug ?? "").trim();

  // Duplicate SKU
  if (sku) {
    if (seenSkus.has(sku)) {
      issues.push({
        severity: "error",
        code: "duplicate_sku",
        message: `SKU "${sku}" повторяется: ${product.id} и ${seenSkus.get(sku)}`,
        record: product,
      });
    } else {
      seenSkus.set(sku, product.id);
    }
  }

  // Duplicate slug
  if (slug) {
    if (seenSlugs.has(slug)) {
      issues.push({
        severity: "error",
        code: "duplicate_slug",
        message: `Slug "${slug}" повторяется: ${product.id} и ${seenSlugs.get(slug)}`,
        record: product,
      });
    } else {
      seenSlugs.set(slug, product.id);
    }
  }

  // Empty / truncated title
  if (!title) {
    issues.push({
      severity: "error",
      code: "empty_title",
      message: `Пустой title у товара ${product.id}`,
      record: product,
    });
  } else if (title.length < 5) {
    issues.push({
      severity: "warning",
      code: "short_title",
      message: `Обрезанный title "${title}" у товара ${product.id}`,
      record: product,
    });
  }

  // Fragment like `4")` without subject
  if (/^\d+\s*["')]/u.test(title) && title.length < 12) {
    issues.push({
      severity: "warning",
      code: "fragment_title",
      message: `Title похож на фрагмент: "${title}" (${product.id})`,
      record: product,
    });
  }

  // Duplicate "John Deere" in title
  const jdCount = (title.match(/john\s*deere/giu) ?? []).length;
  if (jdCount > 1) {
    issues.push({
      severity: "warning",
      code: "duplicate_brand",
      message: `"John Deere" встречается ${jdCount} раза в title: "${title}" (${product.id})`,
      record: product,
    });
  }

  // SKU in title
  if (sku && title.includes(sku)) {
    issues.push({
      severity: "info",
      code: "sku_in_title",
      message: `Артикул "${sku}" входит в title: "${title}" (${product.id})`,
      record: product,
    });
  }

  // Incorrect casing — all-caps or all-lower long titles
  if (title.length > 20 && title === title.toUpperCase()) {
    issues.push({
      severity: "info",
      code: "uppercase_title",
      message: `Title в верхнем регистре: "${title}" (${product.id})`,
      record: product,
    });
  }

  // Indexable product missing minimum data
  if (isIndexable(product)) {
    if (!product?.main_image && !product?.mainImageId) {
      issues.push({
        severity: "warning",
        code: "missing_image",
        message: `Индексируемый товар без изображения: ${title} (${product.id})`,
        record: product,
      });
    }
    if (!product?.short_description && !product?.full_description) {
      issues.push({
        severity: "warning",
        code: "missing_description",
        message: `Индексируемый товар без описания: ${title} (${product.id})`,
        record: product,
      });
    }
    if (!product?.category) {
      issues.push({
        severity: "warning",
        code: "missing_category",
        message: `Индексируемый товар без категории: ${title} (${product.id})`,
        record: product,
      });
    }
  }

  // Price / schema mismatch
  const priceStatus = product?.price_status ?? product?.priceStatus;
  const price = Number(product?.price ?? 0);
  if (priceStatus === "fixed" && (!price || price <= 0)) {
    issues.push({
      severity: "error",
      code: "price_mismatch",
      message: `price_status=fixed, но цена недостоверна: ${title} (${product.id})`,
      record: product,
    });
  }

  // Placeholder values
  const placeholder = /(?:placeholder|тест|example|lorem|tbd|todo)/iu.test(
    `${title} ${product?.short_description ?? ""}`,
  );
  if (placeholder) {
    issues.push({
      severity: "warning",
      code: "placeholder_value",
      message: `Возможное placeholder-значение: ${title} (${product.id})`,
      record: product,
    });
  }
}

// --- Category validation --------------------------------------------------

for (const category of categories) {
  const title = String(category?.title ?? "").trim();

  if (!title) {
    issues.push({
      severity: "error",
      code: "empty_category_title",
      message: `Пустой title у категории ${category.id}`,
      record: category,
    });
  }

  if (isIndexable(category)) {
    if (!category?.description && !category?.intro) {
      issues.push({
        severity: "warning",
        code: "indexable_empty_category",
        message: `Индексируемая категория без описания: ${title} (${category.id})`,
        record: category,
      });
    }
  }
}

// --- Report ---------------------------------------------------------------

const lines = [
  "# Отчёт валидации импорта",
  "",
  `Дата: ${new Date().toISOString()}`,
  `Товаров: ${products.length}, категорий: ${categories.length}`,
  `Проблем: ${issues.length}`,
  "",
  "| Severity | Code | Message |",
  "|---|---|---|",
  ...issues.map(
    (i) => `| ${i.severity} | ${i.code} | ${i.message.replace(/\|/gu, "\\|")} |`,
  ),
  "",
];

const report = lines.join("\n");
const outPath = resolve(ROOT, "outputs/import-validation-report.md");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, report, "utf-8");

process.stdout.write(report);
process.stdout.write(`\n\nReport saved to ${outPath}\n`);

const errors = issues.filter((i) => i.severity === "error").length;
if (errors > 0) {
  process.stderr.write(`\n${errors} error(s) found.\n`);
  process.exit(1);
}
