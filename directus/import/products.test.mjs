import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCategoryRecords,
  buildProductPayload,
  extractCategoryTitle,
  slugify,
  validateSourceProducts,
} from "./products.mjs";

const sourceProduct = {
  sku: "19M7866",
  title: "Фланцевый винт John Deere 19M7866",
  description:
    "Крепёжная деталь.\n\n• Раздел: Запчасти → Крепёж\n• Вес: 0,014 кг\n\nНапишите в сообщения Авито или позвоните.",
  price: 100,
  main_image: "images/06/19M7866_1.jpg",
  gallery: [
    "images/06/19M7866_1.jpg",
    "images/06/19M7866_2.jpg",
  ],
};

test("creates stable URL slugs from Cyrillic catalog names", () => {
  assert.equal(slugify("Крепёж и крепления"), "krepezh-i-krepleniya");
  assert.equal(
    slugify("Фланцевый винт John Deere 19M7866"),
    "flantsevyy-vint-john-deere-19m7866",
  );
});

test("extracts leaf categories and builds a root plus unique children", () => {
  assert.equal(extractCategoryTitle(sourceProduct.description), "Крепёж");

  const categories = buildCategoryRecords([
    sourceProduct,
    { ...sourceProduct, sku: "SECOND" },
    {
      ...sourceProduct,
      sku: "THIRD",
      description: sourceProduct.description.replace(
        "Запчасти → Крепёж",
        "Запчасти → Гидравлика",
      ),
    },
  ]);

  assert.deepEqual(
    categories.map(({ title, parentSlug }) => [title, parentSlug]),
    [
      ["Запчасти John Deere", null],
      ["Гидравлика", "zapchasti-john-deere"],
      ["Крепёж", "zapchasti-john-deere"],
    ],
  );
});

test("maps source data without inventing stock or technical values", () => {
  const payload = buildProductPayload(sourceProduct, {
    categoryId: "category-id",
    fileIdsByPath: new Map([
      ["images/06/19M7866_1.jpg", "file-1"],
      ["images/06/19M7866_2.jpg", "file-2"],
    ]),
    status: "draft",
  });

  assert.equal(payload.sku, sourceProduct.sku);
  assert.equal(payload.price, sourceProduct.price);
  assert.equal(payload.price_status, "fixed");
  assert.equal(payload.availability_status, "on_request");
  assert.equal(payload.category, "category-id");
  assert.equal(payload.main_image, "file-1");
  assert.deepEqual(payload.gallery, ["file-1", "file-2"]);
  assert.equal(payload.status, "draft");
  assert.match(payload.full_description, /оставьте заявку на сайте/i);
  assert.doesNotMatch(payload.full_description, /Авито/i);
});

test("validates duplicate SKUs and missing image files", async () => {
  const existingPaths = new Set(["images/06/19M7866_1.jpg"]);
  const result = await validateSourceProducts(
    [sourceProduct, { ...sourceProduct }],
    async (relativePath) => existingPaths.has(relativePath),
  );

  assert.deepEqual(result.duplicateSkus, ["19M7866"]);
  assert.deepEqual(result.missingImages, ["images/06/19M7866_2.jpg"]);
});
