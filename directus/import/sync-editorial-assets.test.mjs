import test from "node:test";
import assert from "node:assert/strict";

import {
  isCompleteHomepageProduct,
  processItems,
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

test("only features products that have factual commercial fields", () => {
  const complete = {
    title: "Насос",
    sku: "RE504836",
    main_image: "file-id",
    price: "120000",
    price_status: "fixed",
    delivery_status: "На складе поставщика",
  };

  assert.equal(isCompleteHomepageProduct(complete), true);
  assert.equal(isCompleteHomepageProduct({ ...complete, delivery_status: "" }), false);
  assert.equal(isCompleteHomepageProduct({ ...complete, price: null }), false);
});
