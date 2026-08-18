import type { DirectusSeoJson } from "@/lib/seo/directus-seo";

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
  /**
   * R11 dual-read: the additive @directus-labs/seo-plugin JSON. The mapped
   * seoTitle/seoDescription/ogImageId/isIndexable above are already resolved
   * JSON-first with the scalars as per-key fallback; the raw JSON is carried
   * for keys with no scalar counterpart (sitemap priority etc.). Null while
   * the CMS-side migration has not filled the field.
   */
  seo?: DirectusSeoJson | null;
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

/**
 * One gallery image of a product in the normalized dual-read view: either a
 * `product_images` row (R7 canonical child collection, `alt` from alt_text) or
 * a mapped legacy `products.gallery` JSON reference (`alt` is null, the caller
 * falls back to the product-level image alt).
 */
export type ProductImageItem = {
  imageId: string;
  alt: string | null;
};

/**
 * One specification row of a product in the normalized dual-read view: either a
 * `product_specifications` row or a parsed legacy `products.specifications`
 * JSON entry ({ name | label | title, value }).
 */
export type ProductSpecificationItem = {
  name: string;
  value: string;
  unit: string | null;
  group: string | null;
};

/**
 * One attached document of a product in the normalized dual-read view: either
 * a `product_documents` row (title override from the junction) or a mapped
 * legacy `products.documents` JSON reference (no title override).
 */
export type ProductDocumentItem = {
  fileId: string;
  title: string | null;
};

/**
 * Which side of the R7A dual-read won for a product: the canonical child
 * collection rows ("children") or the legacy JSON field ("legacy"). Until an
 * explicit migration-complete criterion exists, an EMPTY child list never
 * shadows a non-empty legacy value — the source is "legacy" in that case.
 */
export type ProductMediaSource = "children" | "legacy";

export type ProductMediaSources = {
  images: ProductMediaSource;
  specifications: ProductMediaSource;
  documents: ProductMediaSource;
};

/**
 * Relation type of a `products_analogs` edge (R8): `analog`, `oem_cross` and
 * `compatible` are logically bidirectional; `superseded_by` is directed
 * ("this article was replaced by...").
 */
export type ProductRelationType =
  | "analog"
  | "oem_cross"
  | "compatible"
  | "superseded_by";

/**
 * One `products_analogs` edge (R8) normalized for the current product:
 * `direction` tells which side of the stored row the product occupies, and
 * `product` is the hydrated card of the OTHER side (published products only —
 * edges to unpublished/missing products are dropped).
 */
export type ProductAnalogItem = {
  relationType: ProductRelationType;
  direction: "from" | "to";
  product: ProductCardData;
  sourceName: string | null;
  note: string | null;
  verifiedAt: string | null;
};

/**
 * Normalized `products_analogs` view of ONE product (R8 dual-read): the
 * symmetric relations (both directions of the stored rows) plus the directed
 * "replaced by" list. The INCOMING side of a supersession ("заменяет...") is
 * dropped by the mapping and never rendered. An EMPTY view must never shadow
 * non-empty legacy `related_products` — RelatedProducts applies that
 * fallback rule (the same rule as the R7A media dual-read).
 */
export type ProductAnalogsView = {
  analogs: ProductAnalogItem[];
  supersededBy: ProductAnalogItem[];
};

export type Product = ProductCardData & {
  fullDescription: string | null;
  seoText: string | null;
  galleryIds: string[];
  specifications: unknown[];
  documentIds: string[];
  /**
   * Normalized dual-read views of the product media (R7A). `getProductBySlugs`
   * always fills them; `galleryIds` / `specifications` / `documentIds` carry
   * the WINNING side of the same dual-read so pages that still read the legacy
   * field names render child-collection data once it exists.
   */
  images?: ProductImageItem[];
  specificationItems?: ProductSpecificationItem[];
  documentItems?: ProductDocumentItem[];
  mediaSources?: ProductMediaSources;
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
  /** R11 dual-read raw plugin JSON (see Category.seo). */
  seo?: DirectusSeoJson | null;
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
  /** R11 dual-read raw plugin JSON (see Category.seo). */
  seo?: DirectusSeoJson | null;
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
  /** R11 dual-read raw plugin JSON (see Category.seo). */
  seo?: DirectusSeoJson | null;
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