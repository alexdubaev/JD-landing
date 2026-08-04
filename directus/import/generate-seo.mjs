/**
 * Generate SEO fields (seo_title, seo_description, brand, mpn) for products
 * following Yandex's quality requirements:
 *
 * - Title: <= 60 chars, unique (catalog article guarantees uniqueness).
 * - Description: 130–160 chars, unique via product-specific data
 *   (weight, dimensions, compatible models).
 * - No emoji / keyword stuffing — natural commercial language.
 * - mpn = sku (John Deere SKU == manufacturer part number).
 * - brand parsed from the "Основные данные" block ("John Deere").
 *
 * Runner modes:
 *   node import/generate-seo.mjs          # dry-run (default): print report, write nothing
 *   node import/generate-seo.mjs --apply  # write to Directus (batches of 50)
 *
 * Only fills fields that are currently empty; existing manual values are kept.
 */

import { DirectusAdminClient, isMainModule } from "../schema/apply-schema.mjs";

const SEO_TITLE_MAX = 60;
const SEO_DESCRIPTION_MIN = 130;
const SEO_DESCRIPTION_MAX = 160;

/** Characters to strip: emoji and decorative pictograms used in the price feed. */
const EMOJI_REGEX =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\uFE0F]/gu;

/** Compact whitespace and remove emoji / decorative symbols. */
export function cleanEmoji(text) {
  return String(text ?? "")
    .replace(EMOJI_REGEX, "")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

/**
 * Parse the stable "📌 Основные данные" / "🚜 Применяемость" blocks of a
 * product's full_description into a typed object. Tolerant of missing blocks.
 */
export function parseFullDescription(text) {
  const source = String(text ?? "");

  const grab = (label) => {
    const re = new RegExp(`•\\s*${label}\\s*:\\s*(.+?)(?:\\n|$)`, "u");
    const m = source.match(re);
    return m ? cleanEmoji(m[1]) : null;
  };

  const weightRaw = grab("Вес");
  const dimsRaw = grab("Размеры");
  const modelsBlock = source.match(/Применяемость[^:]*:\s*(.+?)(?:\n\n|\n🚚|$)/us);
  const models = modelsBlock
    ? cleanEmoji(modelsBlock[1]).replace(/\.$/u, "").trim()
    : null;

  return {
    brand: grab("Бренд"),
    article: grab("Артикул"),
    name: grab("Наименование"),
    unit: grab("Узел"),
    section: grab("Раздел"),
    weight: weightRaw ? weightRaw.replace(/\s+/gu, " ").trim() : null,
    dimensions: dimsRaw ? dimsRaw.replace(/\s+/gu, " ").trim() : null,
    models,
  };
}

/** Trim a string to <= max chars on a word boundary, appending "…" if cut. */
function clampWords(text, max) {
  const value = String(text).trim();
  if (value.length <= max) return value;
  const slice = value.slice(0, max - 1);
  const boundary = slice.lastIndexOf(" ");
  return `${slice.slice(0, boundary > 0 ? boundary : max - 1)}…`;
}

/**
 * Build a unique SEO title: "{name} {sku}" with " — {category}" appended only
 * when the whole thing fits within the limit. The catalog article (sku)
 * guarantees uniqueness across near-identical items (e.g. M8×20 vs M8×30
 * variants of the same screw). The category is decorative — never appended if
 * it would be truncated, to avoid a broken "…—" tail in the SERP.
 */
export function buildSeoTitle({ name, sku, category }) {
  const core = cleanEmoji(name);
  const label = `${core} ${sku}`.trim();
  if (!category) return clampWords(label, SEO_TITLE_MAX);
  const withCategory = `${label} — ${cleanEmoji(category)}`;
  // Only keep the category if it fits intact; otherwise drop it cleanly so the
  // title never ends with a dangling em-dash + ellipsis.
  if (withCategory.length <= SEO_TITLE_MAX) return withCategory;
  return clampWords(label, SEO_TITLE_MAX);
}

function formatPrice(price, currency) {
  if (!price) return null;
  const symbol = currency === "RUB" ? "₽" : currency;
  return `${Number(price).toLocaleString("ru-RU")} ${symbol}`;
}

/**
 * Build a unique 130–160 char description from product-specific data.
 * Pieces are joined until the target window is reached; the article and at
 * least one differentiating attribute (weight/dimensions/models) are always
 * included so neighbouring variants are not duplicates.
 */
export function buildSeoDescription({
  name,
  sku,
  category,
  unit,
  weight,
  dimensions,
  models,
  price,
  currency,
}) {
  const cleanName = cleanEmoji(name);
  const headline = sku
    ? `${cleanName} John Deere, артикул ${sku}.`
    : `${cleanName} John Deere.`;

  // Natural-language sentences, capitalized. Order matters: the most
  // differentiating facts (unit, weight) come first so they survive clamping.
  const segments = [
    headline,
    unit ? `Узел: ${unit}.` : null,
    weight ? `Вес ${weight}.` : null,
    dimensions ? `Размеры: ${dimensions}.` : null,
    models
      ? `Совместим с моделями ${models.split(",").slice(0, 4).join(", ")}.`
      : null,
    price ? `Цена ${formatPrice(price, currency)}.` : null,
    "Поставка по РФ, гарантия подбора.",
  ].filter(Boolean);

  // Build the description greedily: add each sentence only if it fits intact
  // within the limit, so we never cut a number/unit mid-way (which looks
  // broken in the SERP). Always keep at least the headline + one segment.
  const minSegments = 2;
  let description = segments[0] ?? "";
  let added = 1;
  for (let i = 1; i < segments.length; i += 1) {
    const candidate = `${description} ${segments[i]}`;
    if (candidate.length <= SEO_DESCRIPTION_MAX) {
      description = candidate;
      added += 1;
    } else if (added < minSegments && i === 1) {
      // Force at least headline + first segment even if it needs clamping,
      // so the description is never just the headline.
      description = clampWords(candidate, SEO_DESCRIPTION_MAX);
      added += 1;
      break;
    }
  }

  // If we ended up just below the Yandex-recommended 130-char minimum, top up
  // with a compact commercial closer so the snippet isn't flagged as too short.
  if (description.length < SEO_DESCRIPTION_MIN) {
    const closers = [
      "Поставка по РФ, гарантия подбора.",
      "Поставка по РФ под заказ.",
      "В наличии под заказ.",
      "Оплата для юрлиц.",
    ];
    for (const closer of closers) {
      const candidate = `${description} ${closer}`;
      if (candidate.length <= SEO_DESCRIPTION_MAX) {
        description = candidate;
        break;
      }
    }
  }

  return description.trim();
}

/**
 * Map a raw Directus product to the four SEO fields, but ONLY those that are
 * empty. Returns null when all four target fields are already filled (skip).
 *
 * @returns {Object|null} { seo_title, seo_description, brand, mpn } or null.
 */
export function generateSeoFields(product) {
  const has = (v) => v != null && String(v).trim() !== "";
  if (
    has(product.seo_title) &&
    has(product.seo_description) &&
    has(product.brand) &&
    has(product.mpn)
  ) {
    return null;
  }

  const parsed = parseFullDescription(product.full_description);
  const name = parsed.name || cleanEmoji(product.title) || product.sku;
  const categoryTitle =
    typeof product.category === "object" && product.category
      ? product.category.title
      : null;

  const result = {};

  if (!has(product.seo_title)) {
    result.seo_title = buildSeoTitle({
      name,
      sku: product.sku,
      category: categoryTitle,
    });
  }
  if (!has(product.seo_description)) {
    result.seo_description = buildSeoDescription({
      name,
      sku: product.sku,
      category: categoryTitle,
      unit: parsed.unit,
      weight: parsed.weight,
      dimensions: parsed.dimensions,
      models: parsed.models,
      price: product.price,
      currency: product.currency,
    });
  }
  if (!has(product.brand)) {
    result.brand = parsed.brand || "John Deere";
  }
  if (!has(product.mpn) && has(product.sku)) {
    result.mpn = product.sku;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const PRODUCT_FIELDS = [
  "id",
  "title",
  "sku",
  "category.title",
  "full_description",
  "seo_title",
  "seo_description",
  "brand",
  "mpn",
  "price",
  "currency",
].join(",");

function buildQuery(parameters) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return search.toString();
}

async function loadProducts(client) {
  const query = buildQuery({
    "filter[status][_eq]": "published",
    fields: PRODUCT_FIELDS,
    limit: "-1",
  });
  return client.request(`/items/products?${query}`);
}

/** Classify a planned update: title length, description window, duplicates. */
function auditPlan(updates) {
  const titleLengths = updates.map((u) => (u.after.seo_title ?? "").length);
  const descLengths = updates.map((u) => (u.after.seo_description ?? "").length);
  const titles = new Map();
  for (const u of updates) {
    const t = u.after.seo_title;
    if (t) titles.set(t, (titles.get(t) ?? 0) + 1);
  }
  const dupTitles = [...titles.entries()].filter(([, c]) => c > 1);
  return {
    titleOver: titleLengths.filter((l) => l > SEO_TITLE_MAX).length,
    descUnder: descLengths.filter((l) => l > 0 && l < SEO_DESCRIPTION_MIN).length,
    descOver: descLengths.filter((l) => l > SEO_DESCRIPTION_MAX).length,
    duplicateTitles: dupTitles,
  };
}

function printReport(products, updates, skipped) {
  console.log(`\nProducts total: ${products.length}`);
  console.log(`To update:      ${updates.length}`);
  console.log(`Skipped (already filled): ${skipped.length}`);

  if (updates.length === 0) return;

  const audit = auditPlan(updates);
  console.log("\n=== Quality audit ===");
  console.log(`seo_title > ${SEO_TITLE_MAX} chars: ${audit.titleOver}`);
  console.log(
    `seo_description < ${SEO_DESCRIPTION_MIN} chars: ${audit.descUnder}`,
  );
  console.log(
    `seo_description > ${SEO_DESCRIPTION_MAX} chars: ${audit.descOver}`,
  );
  console.log(`duplicate seo_title values: ${audit.duplicateTitles.length}`);
  if (audit.duplicateTitles.length) {
    for (const [title, count] of audit.duplicateTitles.slice(0, 5)) {
      console.log(`  [${count}x] ${title}`);
    }
  }

  console.log("\n=== Sample changes (first 5) ===");
  for (const u of updates.slice(0, 5)) {
    const p = products.find((x) => x.id === u.id);
    console.log(`\n• ${p.title}  [${p.sku}]`);
    console.log(`  seo_title:       ${u.after.seo_title ?? "(unchanged)"}`);
    console.log(`  seo_description: ${u.after.seo_description ?? "(unchanged)"}`);
    console.log(`  brand:           ${u.after.brand ?? "(unchanged)"}`);
    console.log(`  mpn:             ${u.after.mpn ?? "(unchanged)"}`);
  }
}

async function applyUpdates(client, updates) {
  const BATCH = 50;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    await Promise.all(
      batch.map((u) =>
        client.request(`/items/products/${u.id}`, {
          method: "PATCH",
          body: JSON.stringify(u.after),
        }),
      ),
    );
    console.log(`Applied ${Math.min(i + BATCH, updates.length)}/${updates.length}`);
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "Mode: APPLY (writing to Directus)" : "Mode: DRY-RUN (no writes)");

  const client = await DirectusAdminClient.connectFromEnvironment();
  const products = await loadProducts(client);

  const updates = [];
  const skipped = [];
  for (const product of products) {
    const after = generateSeoFields(product);
    if (after) updates.push({ id: product.id, after });
    else skipped.push(product);
  }

  printReport(products, updates, skipped);

  if (!apply) {
    console.log("\nDry-run complete. Re-run with --apply to write changes.");
    return;
  }
  if (updates.length === 0) {
    console.log("\nNothing to apply.");
    return;
  }

  console.log(`\nApplying ${updates.length} updates in batches of 50...`);
  await applyUpdates(client, updates);
  console.log(`Done. ${updates.length} products updated.`);
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
