import "server-only";

import type {
  Product,
  ProductDocumentItem,
  ProductImageItem,
  ProductMediaSource,
  ProductSpecificationItem,
} from "@/types/catalog";

import { directusRequest } from "./client";
import { fileId, queryString, type FileRelation } from "./query";

// ---------------------------------------------------------------------------
// Product media dual-read (R7A)
// ---------------------------------------------------------------------------

/**
 * Bounded child-collection page size. NEVER use limit=-1 for the per-product
 * child reads: a runaway product must not turn into an unbounded response.
 */
const PRODUCT_CHILD_LIMIT = 100;

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
export async function hydrateProductMedia(
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
