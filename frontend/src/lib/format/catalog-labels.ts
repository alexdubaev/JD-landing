import type { ProductCardData } from "@/types/catalog";

/** Russian display labels for product availability (card, detail, filter chips). */
export const AVAILABILITY_LABELS: Record<
  ProductCardData["availabilityStatus"],
  string
> = {
  in_stock: "В наличии",
  on_request: "Под заказ",
  out_of_stock: "Нет в наличии",
};

/**
 * Single source of truth for the catalog filter wording. `optionLabel` is
 * what the <select> shows, `chipLabel` is what the active-filter chip shows
 * (price chips repeat the word "Цена", select options do not).
 */
export type CatalogFilterOption = {
  value: string;
  optionLabel: string;
  chipLabel: string;
};

export const AVAILABILITY_FILTERS: CatalogFilterOption[] = [
  { value: "in_stock", optionLabel: "В наличии", chipLabel: "В наличии" },
  { value: "on_request", optionLabel: "Под заказ", chipLabel: "Под заказ" },
  {
    value: "out_of_stock",
    optionLabel: "Нет в наличии",
    chipLabel: "Нет в наличии",
  },
];

export const PRICE_FILTERS: CatalogFilterOption[] = [
  { value: "fixed", optionLabel: "Указана", chipLabel: "Цена указана" },
  { value: "on_request", optionLabel: "По запросу", chipLabel: "Цена по запросу" },
];

export const PART_TYPE_FILTERS: CatalogFilterOption[] = [
  { value: "original", optionLabel: "Оригинал", chipLabel: "Оригинал" },
  { value: "oem", optionLabel: "OEM", chipLabel: "OEM" },
  { value: "analog", optionLabel: "Аналог", chipLabel: "Аналог" },
];
