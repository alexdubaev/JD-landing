export type AvailabilityStatus = "in_stock" | "on_request" | "out_of_stock";
export type PriceStatus = "fixed" | "on_request" | "hidden";
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
  h1: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoText: string | null;
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
};

export type Product = ProductCardData & {
  fullDescription: string | null;
  seoText: string | null;
  galleryIds: string[];
  specifications: unknown[];
  documents: unknown[];
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageId: string | null;
  relatedProductIds: string[];
  ctaText: string | null;
};

export type CatalogPage = {
  items: ProductCardData[];
  total: number;
  page: number;
  pageSize: number;
};
