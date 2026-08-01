import { parsePartsRequest } from "./parts-request";

export const PRODUCT_REQUEST_LIST_KEY = "deere-shop:product-request-list";
export const PRODUCT_REQUEST_LIST_EVENT = "deere-shop:product-request-list-change";
const GENERATED_PRODUCT_REQUEST_LINES_KEY =
  "deere-shop:parts-request-generated-product-lines";

export type ProductRequestItem = {
  id: string;
  sku: string;
  title: string;
};

type GeneratedProductRequestLine = {
  id: string;
  line: string;
};

const isProductRequestItem = (value: unknown): value is ProductRequestItem => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ProductRequestItem>;
  return (
    typeof item.id === "string" &&
    typeof item.sku === "string" &&
    item.sku.trim().length > 0 &&
    typeof item.title === "string"
  );
};

export function getProductRequestList(): ProductRequestItem[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(
      window.localStorage.getItem(PRODUCT_REQUEST_LIST_KEY) ?? "[]",
    ) as unknown;
    return Array.isArray(value) ? value.filter(isProductRequestItem) : [];
  } catch {
    return [];
  }
}

export function setProductRequestList(items: ProductRequestItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PRODUCT_REQUEST_LIST_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(PRODUCT_REQUEST_LIST_EVENT));
}

export function toggleProductRequestItem(item: ProductRequestItem) {
  const items = getProductRequestList();
  const exists = items.some((current) => current.id === item.id);
  const next = exists
    ? items.filter((current) => current.id !== item.id)
    : [...items, item];
  setProductRequestList(next);
  return !exists;
}

const getGeneratedProductRequestLines = (): GeneratedProductRequestLine[] => {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(
      window.localStorage.getItem(GENERATED_PRODUCT_REQUEST_LINES_KEY) ?? "[]",
    ) as unknown;
    return Array.isArray(value)
      ? value.filter(
          (item): item is GeneratedProductRequestLine =>
            Boolean(item) &&
            typeof item === "object" &&
            typeof (item as GeneratedProductRequestLine).id === "string" &&
            typeof (item as GeneratedProductRequestLine).line === "string",
        )
      : [];
  } catch {
    return [];
  }
};

const setGeneratedProductRequestLines = (items: GeneratedProductRequestLine[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    GENERATED_PRODUCT_REQUEST_LINES_KEY,
    JSON.stringify(items),
  );
};

export function clearGeneratedProductRequestLines() {
  setGeneratedProductRequestLines([]);
}

const productRequestLine = (item: ProductRequestItem) =>
  `${item.sku.trim()} — 1 шт.`;

const removeLastExactLine = (draft: string, target: string) => {
  const lines = draft.split(/\r?\n/gu);
  const index = lines.map((line) => line.trim()).lastIndexOf(target);
  if (index < 0) return draft;
  return lines.filter((_, lineIndex) => lineIndex !== index).join("\n").trim();
};

export function reconcileProductRequestDraft(draft: string) {
  const selected = getProductRequestList();
  const selectedIds = new Set(selected.map((item) => item.id));
  let nextDraft = draft.trim();
  const generated = getGeneratedProductRequestLines();

  for (const item of generated) {
    if (!selectedIds.has(item.id)) {
      nextDraft = removeLastExactLine(nextDraft, item.line);
    }
  }

  const retained = generated.filter((item) => selectedIds.has(item.id));
  const articles = new Set(
    parsePartsRequest(nextDraft).items.map((item) => item.article),
  );

  for (const item of selected) {
    if (retained.some((generatedItem) => generatedItem.id === item.id)) continue;
    const line = productRequestLine(item);
    const article = parsePartsRequest(line).items[0]?.article;
    if (!article || articles.has(article)) continue;
    nextDraft = [nextDraft, line].filter(Boolean).join("\n");
    articles.add(article);
    retained.push({ id: item.id, line });
  }

  setGeneratedProductRequestLines(retained);
  return nextDraft;
}
