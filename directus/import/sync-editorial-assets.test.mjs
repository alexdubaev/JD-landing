import test from "node:test";
import assert from "node:assert/strict";

import {
  isCompleteHomepageProduct,
  homepageFaqItems,
  processItems,
  syncPartsRequestSection,
} from "./sync-editorial-assets.mjs";

test("syncs the four concise homepage process steps from the brief", () => {
  assert.deepEqual(
    processItems.map(({ number, text, title }) => ({ number, text, title })),
    [
      {
        number: "01",
        title: "Отправьте номера деталей",
        text: "Вставьте артикулы, загрузите Excel или прикрепите фото",
      },
      {
        number: "02",
        title: "Мы проверим запрос",
        text: "Уточним применимость, наличие, замену и комплектацию",
      },
      {
        number: "03",
        title: "Получите предложение",
        text: "Цена, сроки, склад и доступные варианты",
      },
      {
        number: "04",
        title: "Оформите поставку",
        text: "Выставим счёт и отправим заказ в ваш регион",
      },
    ],
  );
});

test("features products with factual identity even when commercial fields are unknown", () => {
  const complete = {
    title: "Насос",
    sku: "RE504836",
    main_image: "file-id",
    price: "120000",
    price_status: "fixed",
    delivery_status: "На складе поставщика",
  };

  assert.equal(isCompleteHomepageProduct(complete), true);
  assert.equal(isCompleteHomepageProduct({ ...complete, delivery_status: "" }), true);
  assert.equal(isCompleteHomepageProduct({ ...complete, price: null, price_status: "on_request" }), true);
  assert.equal(isCompleteHomepageProduct({ ...complete, main_image: null }), false);
  assert.equal(isCompleteHomepageProduct({ ...complete, sku: "" }), false);
});

test("moves the homepage parts-request section once and updates it idempotently", async () => {
  const sections = new Map([
    ["home-parts", { id: "home-parts", page: "home", section_type: "parts_request" }],
  ]);
  const requests = [];
  const client = {
    async request(path, options = {}) {
      requests.push([path, options]);
      if (path.startsWith("/items/page_sections?")) {
        const url = new URL(path, "https://cms.test");
        const pageId = url.searchParams.get("filter[page][_eq]");
        return [...sections.values()].filter(
          (section) => section.page === pageId && section.section_type === "parts_request",
        );
      }
      if (path.startsWith("/items/page_sections/") && options.method === "PATCH") {
        const id = path.split("/").at(-1);
        const current = sections.get(id);
        sections.set(id, { ...current, ...JSON.parse(options.body) });
        return sections.get(id);
      }
      throw new Error(`Unexpected request: ${path}`);
    },
  };

  const definition = { section_type: "parts_request", title: "Проверка списка" };
  await syncPartsRequestSection(client, "home", "parts", definition);
  await syncPartsRequestSection(client, "home", "parts", definition);

  assert.equal(sections.size, 1);
  assert.equal(sections.get("home-parts").page, "parts");
  assert.equal(sections.get("home-parts").title, "Проверка списка");
  assert.equal(
    requests.filter(([path, options]) => path === "/items/page_sections/home-parts" && options.method === "PATCH").length,
    2,
  );
});

test("syncs the twelve cautious homepage FAQ questions", () => {
  assert.equal(homepageFaqItems.length, 12);
  assert.deepEqual(homepageFaqItems.map(([question]) => question), [
    "Работаете ли вы с НДС?",
    "Можно ли заказать как юридическое лицо?",
    "Какой минимальный заказ?",
    "Доставляете ли вы по России?",
    "Можно ли получить договор до оплаты?",
    "Есть ли оригинальные детали и аналоги?",
    "Как узнать срок поставки?",
    "Можно ли заказать отсутствующую позицию?",
    "Какие транспортные компании доступны?",
    "Как отправить список артикулов?",
    "Можно ли уточнить совместимость?",
    "Что делать, если цена не указана?",
  ]);
});
