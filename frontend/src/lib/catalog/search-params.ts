import type {
  AvailabilityStatus,
  CatalogQuery,
  CatalogSort,
  PartType,
  PriceStatus,
} from "@/types/catalog";

type SearchParamValue = string | string[] | undefined;
export type CatalogSearchParams = Record<string, SearchParamValue>;

const availabilityValues = new Set<AvailabilityStatus>([
  "in_stock",
  "on_request",
  "out_of_stock",
]);
const priceStatusValues = new Set<PriceStatus>([
  "fixed",
  "on_request",
  "hidden",
]);
const partTypeValues = new Set<PartType>(["original", "oem", "analog"]);
const sortValues = new Set<CatalogSort>([
  "relevance",
  "price_asc",
  "price_desc",
  "title_asc",
]);

const first = (value: SearchParamValue) =>
  Array.isArray(value) ? value[0] : value;

export function parseCatalogSearchParams(
  input: CatalogSearchParams,
): CatalogQuery {
  const rawPage = Number.parseInt(first(input.page) ?? "1", 10);
  const rawAvailability = first(input.availability) as
    | AvailabilityStatus
    | undefined;
  const rawPriceStatus = first(input.price) as PriceStatus | undefined;
  const rawPartType = first(input.part_type) as PartType | undefined;
  const rawSort = first(input.sort) as CatalogSort | undefined;
  const rawCategory = (first(input.category) ?? "").trim();
  const categorySlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(rawCategory)
    ? rawCategory
    : undefined;

  return {
    search: (first(input.q) ?? "").trim().slice(0, 120),
    page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
    pageSize: 24,
    ...(categorySlug ? { categorySlug } : {}),
    ...(rawAvailability && availabilityValues.has(rawAvailability)
      ? { availability: rawAvailability }
      : {}),
    ...(rawPriceStatus && priceStatusValues.has(rawPriceStatus)
      ? { priceStatus: rawPriceStatus }
      : {}),
    ...(rawPartType && partTypeValues.has(rawPartType)
      ? { partType: rawPartType }
      : {}),
    sort: rawSort && sortValues.has(rawSort) ? rawSort : "relevance",
  };
}
