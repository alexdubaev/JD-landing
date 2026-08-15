export type AvailabilityStatus = "in_stock" | "on_request" | "out_of_stock";
export type PriceStatus = "fixed" | "on_request" | "hidden";
export type PartType = "original" | "oem" | "analog";
export type CatalogSort =
  | "relevance"
  | "price_asc"
  | "price_desc"
  | "title_asc";

export type CatalogQuery = {
  search: string;
  categorySlug?: string;
  availability?: AvailabilityStatus;
  priceStatus?: PriceStatus;
  partType?: PartType;
  sort: CatalogSort;
  page: number;
  pageSize: number;
};

export type Category = {
  id: string;
  title: string;
  slug: string;
  parentId: string | null;
  description: string | null;
  imageId: string | null;
  imageAlt: string | null;
  iconId?: string | null;
  iconAlt?: string | null;
  h1: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoText: string | null;
  intro: string | null;
  selectionGuide: unknown[];
  internalLinks: unknown[];
  ogImageId: string | null;
  isIndexable: boolean;
  redirectTarget: string | null;
};

export type ProductCardData = {
  id: string;
  title: string;
  slug: string;
  sku: string;
  category: Pick<Category, "id" | "title" | "slug"> | null;
  shortDescription: string | null;
  mainImageId: string | null;
  imageAlt: string | null;
  price: number | null;
  currency: string;
  priceStatus: PriceStatus;
  availabilityStatus: AvailabilityStatus;
  brand?: string | null;
  mpn?: string | null;
  gtin?: string | null;
  partType?: PartType | null;
  deliveryStatus?: string | null;
};

export type Product = ProductCardData & {
  fullDescription: string | null;
  seoText: string | null;
  galleryIds: string[];
  specifications: unknown[];
  documentIds: string[];
  sourceName?: string | null;
  sourceUrl?: string | null;
  verifiedAt?: string | null;
  reviewedBy?: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageId: string | null;
  seoQualityStatus?: string | null;
  isIndexable?: boolean;
  relatedProductIds: string[];
  ctaText: string | null;
};

/**
 * A product selected for purchase. Only products with `priceStatus === "fixed"`
 * and a numeric `price` can be added to the cart; everything else stays on the
 * existing parts-request (lead) flow.
 */
export type CartLine = {
  id: string;
  slug: string;
  /** Full path to the product page, e.g. /catalog/<categorySlug>/<productSlug>. */
  href: string;
  title: string;
  sku: string;
  unitPrice: number;
  currency: string;
  quantity: number;
  mainImageId: string | null;
  imageAlt: string | null;
};

export type PublicFile = {
  id: string;
  filename: string;
  title: string | null;
  type: string | null;
};

export type CatalogPage = {
  items: ProductCardData[];
  total: number;
  page: number;
  pageSize: number;
};

export type PageSeo = {
  title: string;
  h1: string;
  eyebrow: string | null;
  intro: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageId: string | null;
  canonicalUrl: string | null;
  isIndexable: boolean;
};

export type ArticleCardData = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImageId: string | null;
  imageAlt: string | null;
  publishedAt: string;
  categoryLabel?: string | null;
  readingTimeMinutes?: number | null;
};

export type Article = ArticleCardData & {
  content: string;
  /**
   * Structured body from `articles.content_blocks` (Directus Flexible Editor
   * JSON). Relation nodes are normalised to the renderer contract when the
   * article is loaded (see `@/lib/directus/articles`); the renderer
   * (`@/lib/articles/structured-content.ts`) owns the JSON contract, so the
   * field stays `unknown` here. Null/undefined/invalid value → the article
   * page renders the sanitized `content` HTML fallback instead.
   */
  contentBlocks?: unknown;
  author?: string | null;
  reviewer?: string | null;
  sources?: unknown[];
  relatedCategorySlugs?: string[];
  relatedProductSlugs?: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageId: string | null;
  updatedAt: string | null;
};

export type ArticlePage = {
  items: ArticleCardData[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * Item returned by the Directus `deere-shop-search` endpoint
 * (GET /deere-shop/search): a bounded product projection of an indexed
 * sku_normalized / mpn_normalized / product_codes.normalized_code match.
 */
export type ProductSearchSuggestion = {
  id: string;
  slug: string;
  title: string;
  sku: string;
  mpn: string | null;
  category: { slug: string; title: string } | null;
};

export type ProductSearchSource = "normalized" | "codes";

export type ProductSearchResponse = {
  data: ProductSearchSuggestion[];
  meta: {
    total: number;
    page: number;
    limit: number;
    source: ProductSearchSource;
  };
};