import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSeoDescription,
  buildSeoTitle,
  cleanEmoji,
  generateSeoFields,
  parseFullDescription,
} from "./generate-seo.mjs";

const SEO_TITLE_MAX = 60;
const SEO_DESCRIPTION_MIN = 130;
const SEO_DESCRIPTION_MAX = 160;

// Real full_description from the catalog (two near-identical screws that must
// NOT produce duplicate SEO values — they differ only by size/weight).
const fullDescriptionM8x20 = `🔧 Фланцевый винт с шестигранной головкой M8 × 20 John Deere 19M7866.

Запчасть John Deere для ремонта и обслуживания техники. Применяется как крепёжный или опорный элемент в соответствующем узле техники.
Продаётся по каталожному номеру 19M7866. Перед заказом рекомендуем сверить номер с вашей старой деталью или каталогом техники.

📌 Основные данные:
• Артикул: 19M7866
• Бренд: John Deere
• Наименование: Фланцевый винт с шестигранной головкой M8 × 20
• Узел: Крепеж / Винты
• Раздел: Запчасти → Крепёж
• Вес: 0,014 кг
• Размеры: длина 26,67 мм; высота 17,78 мм
• Фото: 4 шт.

🚜 Применяемость по данным каталога: 2C-280, 2C-284, 2C-300, 2C-304, 2C-324, 2C-350.

🚚 Работаем с юридическими лицами. Отправляем по России транспортными компаниями.`;

const fullDescriptionM8x30 = `🔧 Фланцевый винт с шестигранной головкой, M8 X 30 John Deere 19M7868.

Запчасть John Deere для ремонта и обслуживания техники. Применяется как крепёжный или опорный элемент в соответствующем узле техники.

📌 Основные данные:
• Артикул: 19M7868
• Бренд: John Deere
• Наименование: Фланцевый винт с шестигранной головкой, M8 X 30
• Узел: Крепеж / Винты
• Раздел: Запчасти → Крепёж
• Вес: 0,018 кг
• Размеры: длина 38,1 мм; высота 17,272 мм

🚜 Применяемость по данным каталога: 2C-280, 2C-284, 2C-300, 2C-304, 2C-324, 2C-350.`;

const productM8x20 = {
  id: "p-19M7866",
  title: "Фланцевый винт с шестигранной John Deere 19M7866",
  sku: "19M7866",
  category: { title: "Крепёж" },
  full_description: fullDescriptionM8x20,
  seo_title: null,
  seo_description: null,
  brand: null,
  mpn: null,
  price: "100.00",
  currency: "RUB",
};

const productM8x30 = {
  ...productM8x20,
  id: "p-19M7868",
  title: "Фланцевый винт с шестигранной John Deere 19M7868",
  sku: "19M7868",
  full_description: fullDescriptionM8x30,
  price: "155.00",
};

test("cleanEmoji strips decorative pictograms and collapses whitespace", () => {
  assert.equal(cleanEmoji("🔧 Фланцевый 📌 винт"), "Фланцевый винт");
  assert.equal(cleanEmoji("  multiple   spaces  "), "multiple spaces");
  assert.equal(cleanEmoji(null), "");
});

test("parseFullDescription extracts structured data from the stable blocks", () => {
  const parsed = parseFullDescription(fullDescriptionM8x20);
  assert.equal(parsed.brand, "John Deere");
  assert.equal(parsed.article, "19M7866");
  assert.equal(parsed.name, "Фланцевый винт с шестигранной головкой M8 × 20");
  assert.equal(parsed.unit, "Крепеж / Винты");
  assert.equal(parsed.weight, "0,014 кг");
  assert.ok(parsed.dimensions?.includes("26,67 мм"));
  assert.ok(parsed.models?.startsWith("2C-280"));
});

test("parseFullDescription is tolerant of empty or malformed input", () => {
  assert.deepEqual(parseFullDescription(""), {
    brand: null,
    article: null,
    name: null,
    unit: null,
    section: null,
    weight: null,
    dimensions: null,
    models: null,
  });
  assert.equal(parseFullDescription(null).brand, null);
});

test("buildSeoTitle stays within 60 chars and keeps the article; category only if it fits", () => {
  const title = buildSeoTitle({
    name: "Фланцевый винт с шестигранной головкой M8 × 20",
    sku: "19M7866",
    category: "Крепёж",
  });
  assert.ok(title.length <= SEO_TITLE_MAX, `title too long: ${title.length}`);
  assert.match(title, /19M7866/, "article must always be present");
  // The category is decorative: when the full name+sku already nears the limit,
  // the category is dropped rather than producing a broken "…—" tail.
  assert.doesNotMatch(title, /—…$/, "must not end with a dangling em-dash");
  assert.doesNotMatch(title, /🔧|📌/);
});

test("buildSeoTitle includes the category when there is room", () => {
  const title = buildSeoTitle({
    name: "Ремень",
    sku: "R153025",
    category: "Трансмиссия",
  });
  assert.ok(title.length <= SEO_TITLE_MAX);
  assert.match(title, /R153025/);
  assert.match(title, /Трансмиссия/);
});

test("buildSeoTitle truncates very long names with an ellipsis, not mid-word", () => {
  const title = buildSeoTitle({
    name: "Чрезвычайно длинное наименование детали которое точно не влезает в лимит",
    sku: "X1",
    category: "Двигатель",
  });
  assert.ok(title.length <= SEO_TITLE_MAX);
  // Must end with ellipsis and not cut a word.
  assert.match(title, /…$/);
});

test("buildSeoTitle keeps near-identical variants unique via the article", () => {
  const t1 = buildSeoTitle({
    name: "Фланцевый винт с шестигранной головкой M8 × 20",
    sku: "19M7866",
    category: "Крепёж",
  });
  const t2 = buildSeoTitle({
    name: "Фланцевый винт с шестигранной головкой, M8 X 30",
    sku: "19M7868",
    category: "Крепёж",
  });
  assert.notEqual(t1, t2, "variants must produce distinct titles");
});

test("buildSeoDescription lands in the 130–160 char window for a typical product", () => {
  const desc = buildSeoDescription({
    name: "Фланцевый винт с шестигранной головкой M8 × 20",
    sku: "19M7866",
    category: "Крепёж",
    unit: "Крепеж / Винты",
    weight: "0,014 кг",
    dimensions: "длина 26,67 мм; высота 17,78 мм",
    models: "2C-280, 2C-284, 2C-300, 2C-304, 2C-324, 2C-350",
    price: "100.00",
    currency: "RUB",
  });
  assert.ok(
    desc.length >= SEO_DESCRIPTION_MIN && desc.length <= SEO_DESCRIPTION_MAX,
    `description out of window: ${desc.length} — "${desc}"`,
  );
  // No emoji must leak into the meta description.
  assert.doesNotMatch(desc, /🔧|📌|🚜|🚒/);
  assert.match(desc, /19M7866/);
});

test("buildSeoDescription differentiates variants by weight/dimensions", () => {
  const d1 = buildSeoDescription({
    name: "Фланцевый винт с шестигранной головкой M8 × 20",
    sku: "19M7866",
    category: "Крепёж",
    weight: "0,014 кг",
    models: "2C-280, 2C-284",
    price: "100.00",
    currency: "RUB",
  });
  const d2 = buildSeoDescription({
    name: "Фланцевый винт с шестигранной головкой, M8 X 30",
    sku: "19M7868",
    category: "Крепёж",
    weight: "0,018 кг",
    models: "2C-280, 2C-284",
    price: "155.00",
    currency: "RUB",
  });
  assert.notEqual(d1, d2, "variants must produce distinct descriptions");
});

test("generateSeoFields fills all four empty fields and maps mpn from sku", () => {
  const fields = generateSeoFields(productM8x20);
  assert.ok(fields.seo_title);
  assert.ok(fields.seo_description);
  assert.equal(fields.brand, "John Deere");
  assert.equal(fields.mpn, "19M7866");
});

test("generateSeoFields returns null when all fields are already filled", () => {
  const filled = {
    ...productM8x20,
    seo_title: "Custom title",
    seo_description: "Custom description",
    brand: "John Deere",
    mpn: "19M7866",
  };
  assert.equal(generateSeoFields(filled), null);
});

test("generateSeoFields partially fills only the empty fields", () => {
  const partial = {
    ...productM8x20,
    seo_title: "Already set by SEO manager",
    brand: "John Deere",
  };
  const fields = generateSeoFields(partial);
  assert.equal(fields.seo_title, undefined, "must not overwrite seo_title");
  assert.equal(fields.brand, undefined, "must not overwrite brand");
  assert.ok(fields.seo_description, "must fill the empty description");
  assert.equal(fields.mpn, "19M7866");
});
