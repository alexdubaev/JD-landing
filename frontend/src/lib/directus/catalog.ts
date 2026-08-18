import "server-only";

import type {
  CatalogPage,
  CatalogQuery,
  Category,
  PageSeo,
  Product,
  ProductAnalogItem,
  ProductAnalogsView,
  ProductCardData,
  ProductDocumentItem,
  ProductImageItem,
  ProductMediaSource,
  ProductRelationType,
  ProductSearchSuggestion,
  ProductSpecificationItem,
  PublicFile,
} from "@/types/catalog";

import {
  DirectusRequestError,
  directusEnvelopeRequest,
  directusRequest,
} from "./client";
import { getServerEnv } from "./env";
import { parseSeoJson, resolveSeo } from "@/lib/seo/directus-seo";

type FileRelation = string | { id: string } | null;
type CategoryRelation = {
  id: string;
  title: string;
  slug: string;
} | null;

type RawCategory = {
  id: string;
  title: string;
  slug: string;
  parent: string | { id: string } | null;
  description: string | null;
  image: FileRelation;
  image_alt: string | null;
  icon: FileRelation;
  icon_alt: string | null;
  h1: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_text: string | null;
  intro: string | null;
  selection_guide: unknown;
  internal_links: unknown;
  og_image: FileRelation;
  is_indexable: boolean | null;
  redirect_target: string | null;
  /** R11 additive plugin JSON (null until the CMS migration fills it). */
  seo?: unknown;
};

type RawProduct = {
  id: string;
  title: string;
  slug: string;
  sku: string;
  category: CategoryRelation;
  short_description: string | null;
  full_description?: string | null;
  seo_text?: string | null;
  main_image: FileRelation;
  gallery?: unknown;
  price: string | number | null;
  currency: string;
  price_status: ProductCardData["priceStatus"];
  availability_status: ProductCardData["availabilityStatus"];
  brand?: string | null;
  mpn?: string | null;
  gtin?: string | null;
  part_type?: ProductCardData["partType"];
  delivery_status?: string | null;
  specifications?: unknown;
  documents?: unknown;
  source_name?: string | null;
  source_url?: string | null;
  verified_at?: string | null;
  reviewed_by?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  og_image?: FileRelation;
  image_alt: string | null;
  seo_quality_status?: string | null;
  is_indexable?: boolean | null;
  related_products?: unknown;
  cta_text?: string | null;
  /** R11 additive plugin JSON (null until the CMS migration fills it). */
  seo?: unknown;
};

type RawPageSeo = {
  title: string;
  h1: string;
  eyebrow: string | null;
  intro: string | null;
  seo_title: string | null;
  seo_description: string | null;
  og_image: FileRelation;
  canonical_url: string | null;
  is_indexable: boolean;
  /** R11 additive plugin JSON (null until the CMS migration fills it). */
  seo?: unknown;
};

type RawPublicFile = {
  id: string;
  filename_download: string;
  title: string | null;
  type: string | null;
};

type RawSitemapProduct = {
  slug: string;
  updated_at: string | null;
  category: { slug: string } | null;
};

type RawSitemapCategory = {
  slug: string;
  updated_at: string | null;
};

type RawSkuIndexProduct = Pick<RawProduct, "id" | "sku">;

type RawProductImageRow = {
  image: FileRelation;
  alt_text: string | null;
};

type RawProductSpecificationRow = {
  group_name: string | null;
  name: string | null;
  value: string | null;
  unit: string | null;
};

type RawProductDocumentRow = {
  file: FileRelation;
  title: string | null;
};

const fileId = (relation: FileRelation | undefined) =>
  typeof relation === "string" ? relation : (relation?.id ?? null);

const relationId = (relation: RawCategory["parent"]) =>
  typeof relation === "string" ? relation : (relation?.id ?? null);

const asStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const asUnknownArray = (value: unknown) => (Array.isArray(value) ? value : []);

const mapCategory = (raw: RawCategory): Category => {
  // R11 dual-read: plugin JSON first, scalar SEO fields as per-key fallback.
  // While seo is null this reproduces the previous scalar mapping exactly
  // (is_indexable !== false).
  const seo = resolveSeo(raw, {
    title: raw.seo_title,
    description: raw.seo_description,
    ogImageFileId: fileId(raw.og_image),
    noIndex: raw.is_indexable === false,
  });
  return {
    id: raw.id,
    title: raw.title,
    slug: raw.slug,
    parentId: relationId(raw.parent),
    description: raw.description,
    imageId: fileId(raw.image),
    imageAlt: raw.image_alt,
    iconId: fileId(raw.icon),
    iconAlt: raw.icon_alt,
    h1: raw.h1,
    seoTitle: seo.title,
    seoDescription: seo.description,
    seoText: raw.seo_text,
    intro: raw.intro,
    selectionGuide: asUnknownArray(raw.selection_guide),
    internalLinks: asUnknownArray(raw.internal_links),
    ogImageId: seo.ogImageFileId,
    isIndexable: !seo.noIndex,
    redirectTarget: raw.redirect_target?.trim() || null,
    seo: parseSeoJson(raw.seo),
  };
};

const mapProductCard = (raw: RawProduct): ProductCardData => ({
  id: raw.id,
  title: raw.title,
  slug: raw.slug,
  sku: raw.sku,
  category: raw.category,
  shortDescription: raw.short_description,
  mainImageId: fileId(raw.main_image),
  imageAlt: raw.image_alt,
  price: raw.price == null ? null : Number(raw.price),
  currency: raw.currency,
  priceStatus: raw.price_status,
  availabilityStatus: raw.availability_status,
  brand: raw.brand?.trim() || null,
  mpn: raw.mpn?.trim() || null,
  gtin: raw.gtin?.trim() || null,
  partType:
    raw.part_type === "original" || raw.part_type === "oem" || raw.part_type === "analog"
      ? raw.part_type
      : null,
  deliveryStatus: raw.delivery_status?.trim() || null,
});

const mapProduct = (raw: RawProduct): Product => {
  // R11 dual-read: plugin JSON first, scalar SEO fields as per-key fallback.
  // While seo is null this reproduces the previous scalar mapping exactly
  // (is_indexable !== false).
  const seo = resolveSeo(raw, {
    title: raw.seo_title ?? null,
    description: raw.seo_description ?? null,
    ogImageFileId: fileId(raw.og_image),
    noIndex: raw.is_indexable === false,
  });
  return {
    ...mapProductCard(raw),
    fullDescription: raw.full_description ?? null,
    seoText: raw.seo_text ?? null,
    galleryIds: asStringArray(raw.gallery),
    specifications: asUnknownArray(raw.specifications),
    documentIds: asStringArray(raw.documents),
    sourceName: raw.source_name?.trim() || null,
    sourceUrl: raw.source_url?.trim() || null,
    verifiedAt: raw.verified_at ?? null,
    reviewedBy: raw.reviewed_by?.trim() || null,
    seoTitle: seo.title,
    seoDescription: seo.description,
    ogImageId: seo.ogImageFileId,
    seoQualityStatus: raw.seo_quality_status ?? null,
    isIndexable: !seo.noIndex,
    relatedProductIds: asStringArray(raw.related_products),
    ctaText: raw.cta_text ?? null,
    seo: parseSeoJson(raw.seo),
  };
};

// ---------------------------------------------------------------------------
// Product media dual-read (R7A)
// ---------------------------------------------------------------------------

/**
 * Bounded child-collection page size. NEVER use limit=-1 for the per-product
// child reads: a runaway product must not turn into an unbounded response.
 */
const PRODUCT_CHILD_LIMIT = 100;

const childRowsQueryString = (productId: string, fields: string) =>
  queryString({
    "filter[product][_eq]": productId,
    fields,
    sort: "sort_order,id",
    limit: String(PRODUCT_CHILD_LIMIT),
  });

/**
 * Reads one page of a product child collection (product_images,
 * product_specifications or product_documents) for a product. Errors degrade
 * to an empty list at the call site so a missing collection or a permission
 * gap can never break an existing product route — the legacy JSON fallback
 * still renders (the same resilience contract as fetchProductSuggestions).
 */
async function fetchProductChildRows<Row>(
  collection: string,
  productId: string,
  fields: string,
  tags: string[],
): Promise<Row[]> {
  const items = await directusRequest<Row[]>(
    `/items/${collection}?${childRowsQueryString(productId, fields).toString()}`,
    { next: { revalidate: 300, tags } },
  );
  return Array.isArray(items) ? items : [];
}

const mapChildImageRows = (
  rows: RawProductImageRow[],
): ProductImageItem[] =>
  rows
    .map((row) => ({
      imageId: fileId(row.image),
      alt: row.alt_text?.trim() || null,
    }))
    .filter((item): item is ProductImageItem => item.imageId !== null);

const mapLegacyGallery = (galleryIds: string[]): ProductImageItem[] =>
  galleryIds.map((imageId) => ({ imageId, alt: null }));

const isFilledString = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

const mapChildSpecificationRows = (
  rows: RawProductSpecificationRow[],
): ProductSpecificationItem[] =>
  rows
    .filter(
      (row): row is RawProductSpecificationRow & { name: string; value: string } =>
        isFilledString(row?.name) && isFilledString(row?.value),
    )
    .map((row) => ({
      name: row.name.trim(),
      value: row.value.trim(),
      unit: row.unit?.trim() || null,
      group: row.group_name?.trim() || null,
    }));

/**
 * Legacy `products.specifications` JSON entries ({ name | label | title, value }
 * with string or number values) mapped into the normalized view. Mirrors the
 * parsing SpecTable has always applied.
 */
const mapLegacySpecifications = (
  specifications: unknown[],
): ProductSpecificationItem[] =>
  specifications.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const rawName = record.name ?? record.label ?? record.title;
    const rawValue = record.value;
    if (
      (typeof rawName !== "string" && typeof rawName !== "number") ||
      (typeof rawValue !== "string" && typeof rawValue !== "number")
    ) {
      return [];
    }
    const name = String(rawName).trim();
    const value = String(rawValue).trim();
    return name && value ? [{ name, value, unit: null, group: null }] : [];
  });

const mapChildDocumentRows = (
  rows: RawProductDocumentRow[],
): ProductDocumentItem[] =>
  rows
    .map((row) => ({ fileId: fileId(row.file), title: row.title?.trim() || null }))
    .filter((item): item is ProductDocumentItem => item.fileId !== null);

const mapLegacyDocuments = (documentIds: string[]): ProductDocumentItem[] =>
  documentIds.map((fileId) => ({ fileId, title: null }));

/**
 * The R7A dual-read rule: the child collection wins ONLY when it is
 * non-empty. Until an explicit migration-complete criterion exists, an empty
 * child list must NEVER shadow a non-empty legacy value.
 */
const childWithFallback = <T>(child: T[], legacy: T[]) =>
  child.length > 0
    ? { items: child, source: "children" as const }
    : { items: legacy, source: "legacy" as const };

/**
 * Hydrates a mapped product with the normalized dual-read views of its media.
 * Reads the child collections FIRST (bounded fields, limit 100) and falls back
 * to the legacy JSON fields when a child list is empty (or unreadable). The
 * winning side is also written back into the legacy field names
 * (galleryIds/specifications/documentIds) so pages that still consume those
 * fields render child-collection data as soon as it exists.
 */
async function hydrateProductMedia(
  product: Product,
  productSlug: string,
): Promise<Product> {
  const tags = ["products", `product:${productSlug}`];
  const [imageRows, specificationRows, documentRows] = await Promise.all([
    fetchProductChildRows<RawProductImageRow>(
      "product_images",
      product.id,
      "image,alt_text,sort_order",
      tags,
    ).catch(() => [] as RawProductImageRow[]),
    fetchProductChildRows<RawProductSpecificationRow>(
      "product_specifications",
      product.id,
      "group_name,name,value,unit,sort_order",
      tags,
    ).catch(() => [] as RawProductSpecificationRow[]),
    fetchProductChildRows<RawProductDocumentRow>(
      "product_documents",
      product.id,
      "file,title,sort_order",
      tags,
    ).catch(() => [] as RawProductDocumentRow[]),
  ]);

  const images = childWithFallback(
    mapChildImageRows(imageRows),
    mapLegacyGallery(product.galleryIds),
  );
  const specifications = childWithFallback(
    mapChildSpecificationRows(specificationRows),
    mapLegacySpecifications(product.specifications),
  );
  const documents = childWithFallback(
    mapChildDocumentRows(documentRows),
    mapLegacyDocuments(product.documentIds),
  );
  const mediaSources: Record<
    "images" | "specifications" | "documents",
    ProductMediaSource
  > = {
    images: images.source,
    specifications: specifications.source,
    documents: documents.source,
  };

  return {
    ...product,
    images: images.items,
    specificationItems: specifications.items,
    documentItems: documents.items,
    mediaSources,
    galleryIds: images.items.map(({ imageId }) => imageId),
    specifications: specifications.items,
    documentIds: documents.items.map(({ fileId }) => fileId),
  };
}

// ---------------------------------------------------------------------------
// Product analogs dual-read (R8)
// ---------------------------------------------------------------------------

/**
 * Bounded per-product edge read size. NEVER use limit=-1: a hub product must
 * not turn into an unbounded junction response.
 */
const PRODUCT_ANALOGS_LIMIT = 100;

type RawProductAnalogRow = {
  product_from: string | { id: string } | null;
  product_to: string | { id: string } | null;
  relation_type: string | null;
  source_name: string | null;
  note: string | null;
  verified_at: string | null;
};

const isProductRelationType = (
  value: unknown,
): value is ProductRelationType =>
  value === "analog" ||
  value === "oem_cross" ||
  value === "compatible" ||
  value === "superseded_by";

/**
 * Reads the typed relation edges of ONE product from `products_analogs` (both
 * sides for the symmetric types; only the outgoing side of `superseded_by` —
 * the incoming "заменяет..." side is dropped and never rendered) and hydrates
 * the other endpoints into published product cards.
 *
 * Errors degrade to the EMPTY view (the R7A resilience contract): a missing
 * collection or a public-role permission gap must never break an existing
 * product route — the legacy `related_products` fallback still renders,
 * because an empty analog view never shadows non-empty legacy data.
 */
export async function fetchProductAnalogs(
  productId: string,
): Promise<ProductAnalogsView> {
  try {
    const query = queryString({
      "filter[_or][0][product_from][_eq]": productId,
      "filter[_or][1][product_to][_eq]": productId,
      fields: "product_from,product_to,relation_type,source_name,note,verified_at",
      sort: "relation_type,id",
      limit: String(PRODUCT_ANALOGS_LIMIT),
    });
    const rows = await directusRequest<RawProductAnalogRow[]>(
      `/items/products_analogs?${query}`,
      { next: { revalidate: 300, tags: ["products"] } },
    );

    const edges = (Array.isArray(rows) ? rows : [])
      .flatMap((row): {
        relationType: ProductRelationType;
        direction: "from" | "to";
        otherProductId: string;
        sourceName: string | null;
        note: string | null;
        verifiedAt: string | null;
      }[] => {
        const from = relationId(row?.product_from);
        const to = relationId(row?.product_to);
        if (!from || !to || !isProductRelationType(row?.relation_type)) return [];
        const direction: "from" | "to" = from === productId ? "from" : "to";
        // Only the OUTGOING supersession is rendered ("этот артикул заменён
        // на..."); the reversed edge stays unrendered by contract.
        if (row.relation_type === "superseded_by" && direction === "to") return [];
        const otherProductId = direction === "from" ? to : from;
        if (otherProductId === productId) return []; // self-edge guard
        return [
          {
            relationType: row.relation_type,
            direction,
            otherProductId,
            sourceName: row.source_name?.trim() || null,
            note: row.note?.trim() || null,
            verifiedAt: row.verified_at ?? null,
          },
        ];
      });

    const hydrated = await getProductsByIds(
      edges.map(({ otherProductId }) => otherProductId),
    );
    const cardsById = new Map(hydrated.map((product) => [product.id, product]));
    const items: ProductAnalogItem[] = edges.flatMap(
      ({ otherProductId, ...edge }) => {
        const product = cardsById.get(otherProductId);
        return product ? [{ ...edge, product }] : [];
      },
    );

    return {
      analogs: items.filter((item) => item.relationType !== "superseded_by"),
      supersededBy: items.filter(
        (item) => item.relationType === "superseded_by",
      ),
    };
  } catch {
    return { analogs: [], supersededBy: [] };
  }
}

const categoryFields = [
  "id",
  "title",
  "slug",
  "parent",
  "description",
  "image",
  "image_alt",
  "icon",
  "icon_alt",
  "h1",
  "seo_title",
  "seo_description",
  "seo_text",
  "intro",
  "selection_guide",
  "internal_links",
  "og_image",
  "is_indexable",
  "redirect_target",
  "seo",
].join(",");

const cardFields = [
  "id",
  "title",
  "slug",
  "sku",
  "category.id",
  "category.title",
  "category.slug",
  "short_description",
  "main_image",
  "image_alt",
  "price",
  "currency",
  "price_status",
  "availability_status",
  "brand",
  "mpn",
  "gtin",
  "part_type",
  "delivery_status",
].join(",");

const detailFields = `${cardFields},full_description,seo_text,gallery,specifications,documents,source_name,source_url,verified_at,reviewed_by,seo_title,seo_description,og_image,seo,seo_quality_status,is_indexable,related_products,cta_text`;

const queryString = (parameters: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== "") search.set(key, value);
  }
  return search.toString();
};

const normalizeSku = (value: string) =>
  value.trim().replace(/[\s-]+/gu, "").toLocaleLowerCase("ru");

const looksLikeSkuQuery = (value: string) => /^[a-z0-9\s-]+$/iu.test(value);

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

export async function getCategories(): Promise<Category[]> {
  const query = queryString({
    "filter[status][_eq]": "published",
    fields: categoryFields,
    sort: "sort_order,title",
    limit: "-1",
  });
  const items = await directusRequest<RawCategory[]>(
    `/items/categories?${query}`,
    { next: { revalidate: 300, tags: ["categories"] } },
  );
  return items.map(mapCategory);
}

export async function getHomepageCategories(): Promise<Category[]> {
  const query = queryString({
    "filter[status][_eq]": "published",
    "filter[show_on_homepage][_eq]": "true",
    fields: categoryFields,
    sort: "sort_order,title",
    limit: "12",
  });
  const items = await directusRequest<RawCategory[]>(
    `/items/categories?${query}`,
    { next: { revalidate: 300, tags: ["categories", "homepage"] } },
  );
  return items.map(mapCategory);
}

export async function getFeaturedProducts(
  limit = 5,
): Promise<ProductCardData[]> {
  const safeLimit = Math.min(12, Math.max(1, Math.floor(limit)));
  const fetchLimit = Math.min(36, safeLimit * 3);
  const query = queryString({
    "filter[status][_eq]": "published",
    "filter[is_featured][_eq]": "true",
    "filter[main_image][_nnull]": "true",
    "filter[title][_nnull]": "true",
    "filter[sku][_nnull]": "true",
    fields: cardFields,
    sort: "sort_order,-popularity_score,title",
    limit: String(fetchLimit),
  });
  const items = await directusRequest<RawProduct[]>(
    `/items/products?${query}`,
    { next: { revalidate: 300, tags: ["products", "homepage"] } },
  );
  return items
    .map(mapProductCard)
    .filter(
      (product) =>
        Boolean(product.mainImageId) &&
        Boolean(product.title.trim()) &&
        Boolean(product.sku.trim()),
    )
    .slice(0, safeLimit);
}

export async function getCatalogSuggestions(search: string, limit = 6) {
  const safeLimit = Math.min(6, Math.max(1, Math.floor(limit)));
  const matchedIds = await resolveNormalizedSkuIds(search);
  const query = queryString({
    "filter[status][_eq]": "published",
    "filter[id][_in]": matchedIds?.length ? matchedIds.join(",") : undefined,
    search: matchedIds?.length ? undefined : search,
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

const sortByQuery: Record<CatalogQuery["sort"], string> = {
  relevance: "sort_order,-popularity_score,title",
  price_asc: "price,title",
  price_desc: "-price,title",
  title_asc: "title",
};

export async function getCatalogPage(
  input: CatalogQuery,
): Promise<CatalogPage> {
  const matchedIds = input.search ? await resolveNormalizedSkuIds(input.search) : null;
  const query = queryString({
    "filter[status][_eq]": "published",
    "filter[category][slug][_eq]": input.categorySlug,
    "filter[availability_status][_eq]": input.availability,
    "filter[price_status][_eq]": input.priceStatus,
    "filter[part_type][_eq]": input.partType,
    "filter[id][_in]": matchedIds?.length ? matchedIds.join(",") : undefined,
    search: matchedIds?.length ? undefined : input.search,
    fields: cardFields,
    sort: sortByQuery[input.sort],
    page: String(input.page),
    limit: String(input.pageSize),
    meta: "filter_count",
  });
  const response = await directusEnvelopeRequest<RawProduct[]>(
    `/items/products?${query}`,
    { next: { revalidate: 300, tags: ["products", "categories"] } },
  );
  return {
    items: response.data.map(mapProductCard),
    total: response.meta?.filter_count ?? response.data.length,
    page: input.page,
    pageSize: input.pageSize,
  };
}

export async function getCategoryBySlug(
  slug: string,
): Promise<Category | null> {
  const query = queryString({
    "filter[status][_eq]": "published",
    "filter[slug][_eq]": slug,
    fields: categoryFields,
    limit: "1",
  });
  const items = await directusRequest<RawCategory[]>(
    `/items/categories?${query}`,
    { next: { revalidate: 300, tags: ["categories", `category:${slug}`] } },
  );
  return items[0] ? mapCategory(items[0]) : null;
}

/**
 * Returns a redirect target slug for a category that has been archived
 * (for example after merging a duplicate). Returns null when the slug
 * is not an archived category with a redirect_target.
 */
export async function getCategoryRedirect(
  slug: string,
): Promise<string | null> {
  const query = queryString({
    "filter[slug][_eq]": slug,
    "filter[redirect_target][_null]": "false",
    fields: "status,redirect_target",
    limit: "1",
  });
  const items = await directusRequest<
    Array<{ status: string; redirect_target: string | null }>
  >(`/items/categories?${query}`, {
    next: { revalidate: 300, tags: ["categories", `category:${slug}`] },
  });
  const category = items?.[0];
  if (!category || category.status === "published") return null;
  return category.redirect_target?.trim() || null;
}

export async function getPageSeoBySlug(slug: string): Promise<PageSeo | null> {
  const query = queryString({
    "filter[status][_eq]": "published",
    "filter[slug][_eq]": slug,
    fields:
      "title,h1,eyebrow,intro,seo_title,seo_description,og_image,canonical_url,is_indexable,seo",
    limit: "1",
  });
  const items = await directusRequest<RawPageSeo[]>(
    `/items/pages?${query}`,
    { next: { revalidate: 300, tags: ["pages", `page:${slug}`] } },
  );
  const page = items[0];
  if (!page) return null;
  // R11 dual-read: plugin JSON first, scalar SEO fields as per-key fallback.
  // While seo is null, isIndexable passes the raw is_indexable through
  // unchanged (the pre-R11 behavior); once JSON exists, its no_index wins
  // with the scalar as fallback.
  const seo = resolveSeo(page, {
    title: page.seo_title,
    description: page.seo_description,
    canonical: page.canonical_url,
    ogImageFileId: fileId(page.og_image),
    noIndex: page.is_indexable === false,
  });
  const hasJson = parseSeoJson(page.seo) !== null;
  return {
    title: page.title,
    h1: page.h1,
    eyebrow: page.eyebrow,
    intro: page.intro,
    seoTitle: seo.title,
    seoDescription: seo.description,
    ogImageId: seo.ogImageFileId,
    canonicalUrl: seo.canonical,
    isIndexable: hasJson ? !seo.noIndex : page.is_indexable,
    seo: parseSeoJson(page.seo),
  };
}

export async function getProductBySlugs(
  categorySlug: string,
  productSlug: string,
): Promise<Product | null> {
  const query = queryString({
    "filter[status][_eq]": "published",
    "filter[slug][_eq]": productSlug,
    "filter[category][slug][_eq]": categorySlug,
    fields: detailFields,
    limit: "1",
  });
  const items = await directusRequest<RawProduct[]>(
    `/items/products?${query}`,
    {
      next: {
        revalidate: 300,
        tags: ["products", `product:${productSlug}`],
      },
    },
  );
  if (!items[0]) return null;
  // R7A dual-read: child collections first, legacy JSON fallback when a
  // child list is empty (an empty child list never shadows legacy data).
  return hydrateProductMedia(mapProduct(items[0]), productSlug);
}

export async function getProductsByIds(
  ids: string[],
): Promise<ProductCardData[]> {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (!uniqueIds.length) return [];
  const query = queryString({
    "filter[status][_eq]": "published",
    "filter[id][_in]": uniqueIds.join(","),
    fields: cardFields,
    limit: String(uniqueIds.length),
  });
  const items = await directusRequest<RawProduct[]>(
    `/items/products?${query}`,
    { next: { revalidate: 300, tags: ["products"] } },
  );
  return items.map(mapProductCard);
}

export async function getFilesByIds(ids: string[]): Promise<PublicFile[]> {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (!uniqueIds.length) return [];
  const environment = getServerEnv();
  const query = queryString({
    "filter[id][_in]": uniqueIds.join(","),
    "filter[folder][_eq]": environment.DIRECTUS_PUBLIC_FOLDER_ID,
    fields: "id,filename_download,title,type",
    limit: String(uniqueIds.length),
  });
  const items = await directusRequest<RawPublicFile[]>(`/files?${query}`, {
    next: { revalidate: 300, tags: ["files"] },
  });
  return items.map((file) => ({
    id: file.id,
    filename: file.filename_download,
    title: file.title,
    type: file.type,
  }));
}

export async function getProductSitemapEntries() {
  const query = queryString({
    "filter[status][_eq]": "published",
    "filter[is_indexable][_neq]": "false",
    fields: "slug,updated_at,category.slug",
    sort: "category.slug,slug",
    limit: "-1",
  });
  const items = await directusRequest<RawSitemapProduct[]>(
    `/items/products?${query}`,
    { next: { revalidate: 3600, tags: ["products", "sitemap"] } },
  );
  return items
    .filter(
      (item): item is RawSitemapProduct & { category: { slug: string } } =>
        Boolean(item.category?.slug),
    )
    .map((item) => ({
      categorySlug: item.category.slug,
      productSlug: item.slug,
      updatedAt: item.updated_at,
    }));
}

/**
 * Lightweight category list for the sitemap: includes updated_at for lastmod
 * and excludes categories the SEO manager has marked is_indexable = false.
 */
export async function getCategorySitemapEntries() {
  const query = queryString({
    "filter[status][_eq]": "published",
    "filter[is_indexable][_neq]": "false",
    fields: "slug,updated_at",
    sort: "slug",
    limit: "-1",
  });
  const items = await directusRequest<RawSitemapCategory[]>(
    `/items/categories?${query}`,
    { next: { revalidate: 3600, tags: ["categories", "sitemap"] } },
  );
  return items.map((item) => ({
    slug: item.slug,
    updatedAt: item.updated_at,
  }));
}
