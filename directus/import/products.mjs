import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, isAbsolute, relative, resolve } from "node:path";

import {
  DirectusAdminClient,
  isMainModule,
} from "../schema/apply-schema.mjs";
import { accessBlueprint } from "../access/blueprint.mjs";

const transliteration = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

export function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .split("")
    .map((character) => transliteration[character] ?? character)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function extractCategoryTitle(description) {
  const match = String(description).match(/^• Раздел:\s*(.+)$/mu);
  if (!match) return "Прочие детали John Deere";
  return match[1].split("→").at(-1).trim();
}

export function buildCategoryRecords(products) {
  const root = {
    title: "Запчасти John Deere",
    slug: "zapchasti-john-deere",
    parentSlug: null,
  };
  const titles = new Set(
    products.map(({ description }) => extractCategoryTitle(description)),
  );
  const children = [...titles]
    .sort((left, right) => left.localeCompare(right, "ru"))
    .map((title) => ({
      title,
      slug: slugify(title),
      parentSlug: root.slug,
    }));
  return [root, ...children];
}

const normalizeDescription = (description) =>
  String(description)
    .replace(
      /напишите в сообщения Авито или позвоните/giu,
      "оставьте заявку на сайте или позвоните",
    )
    .replace(/в сообщения Авито/giu, "через форму на сайте")
    .trim();

const shortDescription = (description) =>
  normalizeDescription(description)
    .split(/\r?\n\s*\r?\n/u)
    .find((paragraph) => paragraph.trim())
    ?.trim() ?? "";

export function buildProductPayload(
  source,
  { categoryId, fileIdsByPath = new Map(), status = "draft" },
) {
  const gallery = (source.gallery ?? [])
    .map((path) => fileIdsByPath.get(path))
    .filter(Boolean);
  const titleSlug = slugify(source.title);
  const skuSlug = slugify(source.sku);
  const slug = titleSlug.endsWith(skuSlug)
    ? titleSlug
    : `${titleSlug}-${skuSlug}`;

  return {
    status,
    title: source.title,
    slug,
    sku: String(source.sku),
    category: categoryId,
    short_description: shortDescription(source.description),
    full_description: normalizeDescription(source.description),
    main_image:
      fileIdsByPath.get(source.main_image) ?? gallery.at(0) ?? null,
    gallery,
    price: source.price,
    currency: "RUB",
    price_status: source.price == null ? "on_request" : "fixed",
    availability_status: "on_request",
    specifications: [],
    documents: [],
    image_alt: source.title,
    is_featured: false,
    show_on_homepage: false,
    related_products: [],
  };
}

export async function validateSourceProducts(products, pathExists) {
  const skuCounts = new Map();
  const imagePaths = new Set();
  const invalidRecords = [];

  products.forEach((product, index) => {
    const sku = String(product.sku ?? "").trim();
    skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1);
    if (!sku || !product.title || !product.description) {
      invalidRecords.push(index);
    }
    for (const imagePath of product.gallery ?? []) imagePaths.add(imagePath);
    if (product.main_image) imagePaths.add(product.main_image);
  });

  const duplicateSkus = [...skuCounts]
    .filter(([, count]) => count > 1)
    .map(([sku]) => sku)
    .sort();
  const missingImages = [];
  for (const imagePath of [...imagePaths].sort()) {
    if (!(await pathExists(imagePath))) missingImages.push(imagePath);
  }

  return { duplicateSkus, missingImages, invalidRecords };
}

const safePackagePath = (packageRoot, relativePath) => {
  const absolutePath = resolve(packageRoot, relativePath);
  const fromRoot = relative(packageRoot, absolutePath);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    throw new Error(`Image path escapes import package: ${relativePath}`);
  }
  return absolutePath;
};

const query = (parameters) => new URLSearchParams(parameters).toString();

async function uploadFile(client, absolutePath, title, folderId) {
  const form = new FormData();
  form.set("title", title);
  form.set("folder", folderId);
  form.set(
    "file",
    new Blob([await readFile(absolutePath)]),
    basename(absolutePath),
  );

  const response = await fetch(`${client.baseUrl}/files`, {
    method: "POST",
    headers: { authorization: `Bearer ${client.token}` },
    body: form,
  });
  if (!response.ok) {
    throw new Error(
      `File upload failed for ${title}: HTTP ${response.status} ${await response.text()}`,
    );
  }
  return (await response.json()).data;
}

async function ensureFiles(client, packageRoot, products, folderId) {
  const existing = await client.request(
    `/files?${query({
      "filter[folder][_eq]": folderId,
      limit: "-1",
      fields: "id,title",
    })}`,
  );
  const idByTitle = new Map(existing.map((file) => [file.title, file.id]));
  const paths = [
    ...new Set(products.flatMap((product) => product.gallery ?? [])),
  ].sort();
  const idsByPath = new Map();

  for (const [index, imagePath] of paths.entries()) {
    const title = `jd-import/${imagePath.replaceAll("\\", "/")}`;
    let id = idByTitle.get(title);
    if (!id) {
      const file = await uploadFile(
        client,
        safePackagePath(packageRoot, imagePath),
        title,
        folderId,
      );
      id = file.id;
      idByTitle.set(title, id);
    }
    idsByPath.set(imagePath, id);

    if ((index + 1) % 50 === 0 || index + 1 === paths.length) {
      console.log(`Images ready: ${index + 1}/${paths.length}`);
    }
  }

  return idsByPath;
}

async function ensureCategories(client, records, status) {
  const existing = await client.request(
    "/items/categories?limit=-1&fields=id,slug,parent",
  );
  const bySlug = new Map(existing.map((item) => [item.slug, item]));

  for (const record of records) {
    const parent = record.parentSlug
      ? bySlug.get(record.parentSlug)?.id
      : null;
    let item = bySlug.get(record.slug);
    if (!item) {
      item = await client.request("/items/categories", {
        method: "POST",
        body: JSON.stringify({
          status,
          title: record.title,
          slug: record.slug,
          parent,
          h1: record.title,
          image_alt: record.title,
        }),
      });
      bySlug.set(record.slug, item);
    } else if (item.parent !== parent) {
      item = await client.request(`/items/categories/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ parent }),
      });
      bySlug.set(record.slug, item);
    }
  }

  return new Map([...bySlug].map(([slug, item]) => [slug, item.id]));
}

async function ensureProducts(
  client,
  products,
  categoryIds,
  fileIdsByPath,
  status,
) {
  const existing = await client.request(
    "/items/products?limit=-1&fields=id,sku",
  );
  const bySku = new Map(existing.map((item) => [item.sku, item]));

  for (const [index, source] of products.entries()) {
    const categorySlug = slugify(extractCategoryTitle(source.description));
    const payload = buildProductPayload(source, {
      categoryId: categoryIds.get(categorySlug),
      fileIdsByPath,
      status,
    });
    const item = bySku.get(payload.sku);
    if (item) {
      await client.request(`/items/products/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } else {
      const created = await client.request("/items/products", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      bySku.set(payload.sku, created);
    }

    if ((index + 1) % 25 === 0 || index + 1 === products.length) {
      console.log(`Products ready: ${index + 1}/${products.length}`);
    }
  }
}

async function main() {
  const packageRoot = resolve(
    process.cwd(),
    process.env.PRODUCT_IMPORT_DIR ??
      "../outputs/jd-product-import-2026-07-28",
  );
  const statusArgument = process.argv.find((value) =>
    value.startsWith("--status="),
  );
  const status = statusArgument?.split("=").at(1) ?? "draft";
  if (!["draft", "published"].includes(status)) {
    throw new Error("Import status must be draft or published");
  }

  const products = JSON.parse(
    await readFile(resolve(packageRoot, "products.json"), "utf8"),
  );
  const validation = await validateSourceProducts(products, async (imagePath) => {
    try {
      await access(
        safePackagePath(packageRoot, imagePath),
        constants.R_OK,
      );
      return true;
    } catch {
      return false;
    }
  });
  if (
    validation.duplicateSkus.length ||
    validation.missingImages.length ||
    validation.invalidRecords.length
  ) {
    throw new Error(`Source validation failed: ${JSON.stringify(validation)}`);
  }

  const categories = buildCategoryRecords(products);
  console.log(
    `Validated ${products.length} products, ${categories.length} categories`,
  );
  if (process.argv.includes("--dry-run")) return;

  const client = await DirectusAdminClient.connectFromEnvironment();
  const folderId = accessBlueprint.publicAssetFolder.id;
  const fileIdsByPath = await ensureFiles(
    client,
    packageRoot,
    products,
    folderId,
  );
  const categoryIds = await ensureCategories(client, categories, status);
  await ensureProducts(
    client,
    products,
    categoryIds,
    fileIdsByPath,
    status,
  );
  console.log("Product import is complete.");
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
