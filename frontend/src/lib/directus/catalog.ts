import "server-only";

import type {
  CatalogPage,
  CatalogQuery,
  Category,
  Product,
  ProductCardData,
} from "@/types/catalog";

import { directusEnvelopeRequest, directusRequest } from "./client";

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
  h1: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_text: string | null;
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
  specifications?: unknown;
  documents?: unknown;
  seo_title?: string | null;
  seo_description?: string | null;
  og_image?: FileRelation;
  image_alt: string | null;
  related_products?: unknown;
  cta_text?: string | null;
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

const mapCategory = (raw: RawCategory): Category => ({
  id: raw.id,
  title: raw.title,
  slug: raw.slug,
  parentId: relationId(raw.parent),
  description: raw.description,
  imageId: fileId(raw.image),
  imageAlt: raw.image_alt,
  h1: raw.h1,
  seoTitle: raw.seo_title,
  seoDescription: raw.seo_description,
  seoText: raw.seo_text,
});

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
});

const mapProduct = (raw: RawProduct): Product => ({
  ...mapProductCard(raw),
  fullDescription: raw.full_description ?? null,
  seoText: raw.seo_text ?? null,
  galleryIds: asStringArray(raw.gallery),
  specifications: asUnknownArray(raw.specifications),
  documents: asUnknownArray(raw.documents),
  seoTitle: raw.seo_title ?? null,
  seoDescription: raw.seo_description ?? null,
  ogImageId: fileId(raw.og_image),
  relatedProductIds: asStringArray(raw.related_products),
  ctaText: raw.cta_text ?? null,
});

const categoryFields = [
  "id",
  "title",
  "slug",
  "parent",
  "description",
  "image",
  "image_alt",
  "h1",
  "seo_title",
  "seo_description",
  "seo_text",
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
].join(",");

const detailFields = `${cardFields},full_description,seo_text,gallery,specifications,documents,seo_title,seo_description,og_image,related_products,cta_text`;

const queryString = (parameters: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== "") search.set(key, value);
  }
  return search.toString();
};

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

const sortByQuery: Record<CatalogQuery["sort"], string> = {
  relevance: "-popularity_score,title",
  price_asc: "price,title",
  price_desc: "-price,title",
  title_asc: "title",
};

export async function getCatalogPage(
  input: CatalogQuery,
): Promise<CatalogPage> {
  const query = queryString({
    "filter[status][_eq]": "published",
    "filter[category][slug][_eq]": input.categorySlug,
    "filter[availability_status][_eq]": input.availability,
    "filter[price_status][_eq]": input.priceStatus,
    search: input.search,
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
  return items[0] ? mapProduct(items[0]) : null;
}
