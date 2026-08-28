import "server-only";

import type { ProductCardData, ProductSearchSuggestion } from "@/types/catalog";

import { cardFields, getProductsByIds, mapProductCard, type RawProduct } from "./catalog";
import { DirectusRequestError, directusRequest } from "./client";
import { queryString } from "./query";

// ---------------------------------------------------------------------------
// Catalog search and suggestions
// ---------------------------------------------------------------------------

const normalizeSku = (value: string) =>
  value.trim().replace(/[\s-]+/gu, "").toLocaleLowerCase("ru");

const looksLikeSkuQuery = (value: string) => /^[a-z0-9\s-]+$/iu.test(value);

type RawSkuIndexProduct = { id: string; sku: string };

/**
 * Cache-key-friendly search normalization: user input goes through this
 * before it becomes a fetch parameter, so casing/whitespace variants of the
 * same query share one data-cache entry instead of one per raw string.
 * Also bounds the length (the route already rejects < 2 chars).
 */
export const normalizeSearchQuery = (value: string) =>
  value.trim().toLocaleLowerCase("ru").slice(0, 64);

// SKU matches hydrated into suggestions need at most the response limit;
// capping keeps the `filter[id][_in]` URL short when a short pattern
// (e.g. "50") matches hundreds of SKUs.
const SUGGESTION_MATCH_CAP = 20;

// Catalog pages paginate over matched ids, so the cap is higher — it only
// guards the filter URL length (~100 uuids ≈ 3.7 KB) for degenerate
// substring matches, well past any realistic search result set.
const CATALOG_MATCH_CAP = 100;

async function resolveNormalizedSkuIds(search: string) {
  if (!looksLikeSkuQuery(search)) return null;
  const query = queryString({
    "filter[status][_eq]": "published",
    fields: "id,sku",
    limit: "-1",
  });
  const index = await directusRequest<RawSkuIndexProduct[]>(
    `/items/products?${query}`,
    { next: { revalidate: 300, tags: ["products"] } },
  );
  const needle = normalizeSku(search);
  return index
    .filter((product) => normalizeSku(product.sku).includes(needle))
    .map((product) => product.id);
}

export async function getCatalogSuggestions(search: string, limit = 6) {
  const safeLimit = Math.min(6, Math.max(1, Math.floor(limit)));
  const matchedIds = await resolveNormalizedSkuIds(search);
  const query = queryString({
    "filter[status][_eq]": "published",
    "filter[id][_in]": matchedIds?.length
      ? matchedIds.slice(0, SUGGESTION_MATCH_CAP).join(",")
      : undefined,
    search: matchedIds?.length ? undefined : normalizeSearchQuery(search),
    fields: cardFields,
    sort: "-popularity_score,title",
    limit: String(safeLimit),
  });
  const items = await directusRequest<RawProduct[]>(`/items/products?${query}`, {
    next: { revalidate: 60, tags: ["products"] },
  });
  return items.map(mapProductCard);
}

/**
 * The same normalization the Directus `deere-shop-search` endpoint and the
 * backfill migration apply: uppercase, trim, strip every non-alphanumeric
 * character (e.g. " re-504 836 " -> "RE504836").
 */
const normalizeCodeQuery = (value: string) =>
  value.trim().toUpperCase().replace(/[^A-Z0-9]+/gu, "");

/**
 * Indexed SKU/OEM suggestions via the Directus endpoint extension
 * (GET /deere-shop/search): bounded starts_with lookups over
 * products.sku_normalized / mpn_normalized and product_codes.normalized_code.
 * The matched ids are hydrated into full product cards (published only),
 * keeping the endpoint's ranking order.
 */
async function fetchIndexedProductSuggestions(
  search: string,
  safeLimit: number,
): Promise<ProductCardData[]> {
  const query = queryString({
    q: normalizeCodeQuery(search),
    limit: String(safeLimit),
  });
  const suggestions = await directusRequest<ProductSearchSuggestion[]>(
    `/deere-shop/search?${query}`,
    { next: { revalidate: 60, tags: ["products"] } },
  );
  const ids = suggestions.map((item) => item?.id).filter(Boolean);
  if (!ids.length) return [];
  const hydrated = await getProductsByIds(ids);
  const order = new Map(suggestions.map((item, index) => [item.id, index]));
  return hydrated.toSorted(
    (left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0),
  );
}

const isEndpointUnavailable = (error: unknown): boolean => {
  if (error instanceof DirectusRequestError) return error.status === 404;
  return error instanceof TypeError;
};

/**
 * Catalog suggestions for the search box. Code-like queries (latin letters,
 * digits, spaces, hyphens — the legacy `looksLikeSkuQuery` split) go to the
 * indexed `/deere-shop/search` endpoint; free-text queries keep the legacy
 * Directus full-text path.
 *
 * FALLBACK (explicit): when the endpoint answers 404 (the deere-shop-search
 * extension is not installed on this Directus yet) or Directus is
 * unreachable (network error), code-like queries degrade to the legacy
 * scan-based path instead of failing. Any other error propagates so real
 * regressions stay visible.
 */
export async function fetchProductSuggestions(
  search: string,
  limit = 6,
): Promise<ProductCardData[]> {
  const safeLimit = Math.min(6, Math.max(1, Math.floor(limit)));
  if (looksLikeSkuQuery(search) && normalizeCodeQuery(search).length >= 2) {
    try {
      return await fetchIndexedProductSuggestions(search, safeLimit);
    } catch (error) {
      if (!isEndpointUnavailable(error)) throw error;
    }
  }
  return getCatalogSuggestions(search, safeLimit);
}

export async function resolveSearchMatchedIds(
  search: string | undefined,
): Promise<string[] | null> {
  if (!search) return null;
  const matchedIds = await resolveNormalizedSkuIds(search);
  return matchedIds?.length
    ? matchedIds.slice(0, CATALOG_MATCH_CAP)
    : matchedIds;
}
