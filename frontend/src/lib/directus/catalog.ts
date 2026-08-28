import "server-only";

import type {
  CatalogPage,
  CatalogQuery,
  Category,
  PageSeo,
  Product,
  ProductCardData,
  PublicFile,
} from "@/types/catalog";

import {
  directusEnvelopeRequest,
  directusRequest,
} from "./client";
import { getServerEnv } from "./env";
import { parseSeoJson, resolveSeo } from "@/lib/seo/directus-seo";
import { fileId, queryString, relationId, type FileRelation } from "./query";

import { hydrateProductMedia } from "./product-media";
import { normalizeSearchQuery, resolveSearchMatchedIds } from "./search";

// Focused modules re-exported here so every consumer keeps importing from
// "@/lib/directus/catalog" (media dual-read, analogs, search/suggestions).
export * from "./product-analogs";
export * from "./search";

type CategoryRelation = {
  id: string;
  title: string;
  slug: string;
} | null;

type RawCategory = {
  id: string;
  title: string;
  slug: string;
  sort_order: number | null;
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

export type RawProduct = {
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
    sortOrder: raw.sort_order ?? 0,
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

export const mapProductCard = (raw: RawProduct): ProductCardData => ({
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

const categoryFields = [
  "id",
  "title",
  "slug",
  "sort_order",
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

// Light variant for consumers that only render the category tree/links:
// skips the heavy seo_text/selection_guide/internal_links payloads.
const categoryLightFields = "id,title,slug,sort_order,parent,is_indexable";

export const cardFields = [
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

/**
 * Category list trimmed to identity fields for link listings (llms.txt).
 * Maps through the same raw shape; heavy CMS fields are simply not fetched.
 */
export async function getCategoryLinks(): Promise<Category[]> {
  const query = queryString({
    "filter[status][_eq]": "published",
    fields: categoryLightFields,
    sort: "sort_order,title",
    limit: "-1",
  });
  const items = await directusRequest<
    Array<Pick<RawCategory, "id" | "title" | "slug" | "sort_order" | "parent" | "is_indexable">>
  >(`/items/categories?${query}`, {
    next: { revalidate: 300, tags: ["categories"] },
  });
  return items.map((raw) => ({
    id: raw.id,
    title: raw.title,
    slug: raw.slug,
    sortOrder: raw.sort_order ?? 0,
    parentId: relationId(raw.parent),
    description: null,
    imageId: null,
    imageAlt: null,
    iconId: null,
    iconAlt: null,
    h1: null,
    seoTitle: null,
    seoDescription: null,
    seoText: null,
    intro: null,
    selectionGuide: [],
    internalLinks: [],
    ogImageId: null,
    isIndexable: raw.is_indexable !== false,
    redirectTarget: null,
    seo: null,
  }));
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

const sortByQuery: Record<CatalogQuery["sort"], string> = {
  relevance: "sort_order,-popularity_score,title",
  price_asc: "price,title",
  price_desc: "-price,title",
  title_asc: "title",
};

export async function getCatalogPage(
  input: CatalogQuery,
): Promise<CatalogPage> {
  const matchedIds = await resolveSearchMatchedIds(input.search);
  const query = queryString({
    "filter[status][_eq]": "published",
    "filter[category][slug][_eq]": input.categorySlug,
    "filter[availability_status][_eq]": input.availability,
    "filter[price_status][_eq]": input.priceStatus,
    "filter[part_type][_eq]": input.partType,
    "filter[id][_in]": matchedIds?.length ? matchedIds.join(",") : undefined,
    search: matchedIds?.length ? undefined : normalizeSearchQuery(input.search),
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
