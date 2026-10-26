export const MAX_PARTS_REQUEST_ITEMS = 100;
export const MAX_PARTS_REQUEST_QUANTITY = 100_000;

export type PartsRequestItem = {
  article: string;
  quantity: number;
};

export type PartsRequestParseResult = {
  items: PartsRequestItem[];
  error: string | null;
};

const itemLimitError = "Добавьте от 1 до 100 уникальных артикулов.";

const normalizeArticle = (value: string) =>
  value.replace(/\s+/gu, "").toLocaleUpperCase("ru");

const parseLine = (line: string): PartsRequestItem | null => {
  const compact = line.trim().replace(/[—–]/gu, "-");
  if (!compact) return null;

  let articleText = compact;
  let quantityText: string | undefined;
  const tabColumns = compact.split("\t");
  if (tabColumns.length > 1) {
    if (tabColumns.length !== 2) return null;
    [articleText, quantityText] = tabColumns.map((part) => part.trim());
  } else {
    const quantityMatch = compact.match(/(?:\s+-\s+|\s{2,})(.+)$/u);
    if (quantityMatch) {
      articleText = compact.slice(0, quantityMatch.index).trim();
      quantityText = quantityMatch[1].trim().replace(/\s*(?:шт\.?|pcs?)$/iu, "");
    } else {
      const singleSpaceQuantity = compact.match(/^(.+\d.*)\s+(.+)$/u);
      if (singleSpaceQuantity) {
        articleText = singleSpaceQuantity[1];
        quantityText = singleSpaceQuantity[2].replace(/\s*(?:шт\.?|pcs?)$/iu, "");
      }
    }
  }

  const article = normalizeArticle(articleText);
  if (!article || !/^[\p{L}\p{N}_./-]+$/u.test(article)) return null;
  if (quantityText === undefined) return { article, quantity: 1 };
  if (!/^\d{1,6}$/u.test(quantityText)) return null;
  const quantity = Number(quantityText);
  return quantity > 0 ? { article, quantity } : null;
};

export function normalizePartsRequestItems(items: PartsRequestItem[]) {
  const quantities = new Map<string, number>();
  for (const item of items) {
    const article = normalizeArticle(item.article);
    quantities.set(article, (quantities.get(article) ?? 0) + item.quantity);
  }
  return [...quantities].map(([article, quantity]) => ({ article, quantity }));
}

export function parsePartsRequest(value: string): PartsRequestParseResult {
  const lines = value.split(/\r?\n/gu);
  const invalidLines = lines.flatMap((line, index) =>
    line.trim() && !parseLine(line) ? [index + 1] : [],
  );
  const normalizedItems = invalidLines.length
    ? []
    : normalizePartsRequestItems(lines.flatMap((line) => {
        const item = parseLine(line);
        return item ? [item] : [];
      }));
  const excessiveQuantity = normalizedItems.some(
    (item) => item.quantity > MAX_PARTS_REQUEST_QUANTITY,
  );
  const items = excessiveQuantity ? [] : normalizedItems;

  return {
    items,
    error:
      invalidLines.length
        ? `Проверьте строки: ${invalidLines.join(", ")}.`
        : excessiveQuantity
          ? `Количество одного артикула не может превышать ${MAX_PARTS_REQUEST_QUANTITY}.`
          : items.length === 0 || items.length > MAX_PARTS_REQUEST_ITEMS
            ? itemLimitError
          : null,
  };
}
