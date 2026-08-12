import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const argumentsByName = new Map(
  process.argv.slice(2).flatMap((argument) => {
    const [name, ...value] = argument.split("=");
    return name.startsWith("--") ? [[name, value.join("=")]] : [];
  }),
);
const inputPath = argumentsByName.get("--input");
const reportPath = argumentsByName.get("--report");
const dryRun = process.argv.includes("--dry-run");
const directusUrl = process.env.DIRECTUS_URL?.replace(/\/+$/u, "");
let directusToken = process.env.DIRECTUS_TOKEN;

if (!inputPath) throw new Error("Pass --input=/absolute/path/to/analogs.csv");
if (!reportPath) throw new Error("Pass --report=/absolute/path/to/report.csv");
if (!directusUrl) throw new Error("Set DIRECTUS_URL");

function parseDelimited(input, delimiter = ";") {
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
    else if (character === delimiter) {
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
  const [header, ...rows] = parseDelimited(csv);
  const normalizedHeader = header.map((value) => value.replace(/^\uFEFF/u, ""));
  return rows
    .filter((row) => row.some((value) => value.trim()))
    .map((row) =>
      Object.fromEntries(
        normalizedHeader.map((name, index) => [name, row[index] ?? ""]),
      ),
    );
}

const normalizeSku = (value) =>
  String(value ?? "")
    .trim()
    .replace(/[\s-]+/gu, "")
    .toUpperCase();

function asAnalogs(value) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function asStoredAnalogs(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function reportCsv(rows) {
  const header = [
    "sku",
    "product_id",
    "old_title",
    "new_title",
    "old_analogs",
    "new_analogs",
    "result",
  ];
  return [header, ...rows.map((row) => header.map((field) => row[field]))]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
}

async function authenticate() {
  if (directusToken) return;
  const email = process.env.DIRECTUS_ADMIN_EMAIL;
  const password = process.env.DIRECTUS_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Set DIRECTUS_TOKEN or DIRECTUS_ADMIN_EMAIL and DIRECTUS_ADMIN_PASSWORD",
    );
  }
  const response = await fetch(`${directusUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`Directus login failed: ${response.status}`);
  }
  directusToken = (await response.json()).data.access_token;
}

async function request(path, options = {}) {
  const response = await fetch(`${directusUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${directusToken}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    throw new Error(
      `${options.method ?? "GET"} ${path} failed: ${response.status} ${await response.text()}`,
    );
  }
  return (await response.json()).data;
}

async function main() {
  await authenticate();
  const source = readRecords(await readFile(inputPath, "utf8"));
  const requiredColumns = ["Артикул", "Аналоги", "Товар"];
  const missingColumns = requiredColumns.filter(
    (column) => !source[0] || !(column in source[0]),
  );
  const invalidRows = source
    .map((row, index) => ({ row, index: index + 2 }))
    .filter(({ row }) =>
      requiredColumns.some((column) => !String(row[column] ?? "").trim()),
    )
    .map(({ index }) => index);
  const sourceBySku = new Map();
  const duplicateSourceSkus = new Set();
  for (const row of source) {
    const sku = normalizeSku(row["Артикул"]);
    if (sourceBySku.has(sku)) duplicateSourceSkus.add(sku);
    sourceBySku.set(sku, row);
  }
  if (missingColumns.length || invalidRows.length || duplicateSourceSkus.size) {
    throw new Error(
      JSON.stringify({
        missingColumns,
        invalidRows,
        duplicateSourceSkus: [...duplicateSourceSkus].sort(),
      }),
    );
  }

  const products = await request(
    "/items/products?limit=-1&fields=id,sku,title,analog_skus",
  );
  const productsBySku = new Map();
  const duplicateCatalogSkus = new Set();
  for (const product of products) {
    const sku = normalizeSku(product.sku);
    if (!sku) continue;
    if (productsBySku.has(sku)) duplicateCatalogSkus.add(sku);
    productsBySku.set(sku, product);
  }
  const missingCatalogSkus = [...sourceBySku.keys()]
    .filter((sku) => !productsBySku.has(sku))
    .sort();
  if (duplicateCatalogSkus.size || missingCatalogSkus.length) {
    throw new Error(
      JSON.stringify({
        duplicateCatalogSkus: [...duplicateCatalogSkus].sort(),
        missingCatalogSkus,
      }),
    );
  }

  const reconciliation = source.map((row) => {
    const sku = normalizeSku(row["Артикул"]);
    const product = productsBySku.get(sku);
    const newTitle = row["Товар"].trim();
    const newAnalogs = asAnalogs(row["Аналоги"]);
    const oldAnalogs = asStoredAnalogs(product.analog_skus);
    const changed =
      product.title !== newTitle ||
      JSON.stringify(oldAnalogs) !== JSON.stringify(newAnalogs);
    return {
      sku: product.sku,
      product_id: product.id,
      old_title: product.title,
      new_title: newTitle,
      old_analogs: oldAnalogs.join(", "),
      new_analogs: newAnalogs.join(", "),
      result: changed ? (dryRun ? "would_update" : "updated") : "unchanged",
      changed,
      payload: { title: newTitle, analog_skus: newAnalogs },
    };
  });

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, reportCsv(reconciliation), "utf8");

  const updates = reconciliation.filter((item) => item.changed);
  console.log(
    JSON.stringify(
      {
        sourceRows: source.length,
        catalogProducts: products.length,
        updates: updates.length,
        unchanged: reconciliation.length - updates.length,
        dryRun,
        reportPath,
      },
      null,
      2,
    ),
  );
  if (dryRun) return;

  for (const [index, update] of updates.entries()) {
    await request(`/items/products/${encodeURIComponent(update.product_id)}`, {
      method: "PATCH",
      body: JSON.stringify(update.payload),
    });
    console.log(`Updated ${index + 1}/${updates.length}: ${update.sku}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
