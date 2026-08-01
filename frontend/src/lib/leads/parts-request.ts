export const MAX_PARTS_REQUEST_ITEMS = 100;

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

  const quantityMatch = compact.match(
    /(?:\s*-\s*|\s{2,})(\d{1,5})\s*(?:шт\.?|pcs?)?$/iu,
  );
  const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
  const article = normalizeArticle(
    quantityMatch
      ? compact.slice(0, quantityMatch.index).trim()
      : compact,
  );

  if (!article || quantity < 1) return null;
  return { article, quantity };
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
  const items = normalizePartsRequestItems(
    value.split(/\r?\n/gu).flatMap((line) => {
      const item = parseLine(line);
      return item ? [item] : [];
    }),
  );

  return {
    items,
    error:
      items.length === 0 || items.length > MAX_PARTS_REQUEST_ITEMS
        ? itemLimitError
        : null,
  };
}
