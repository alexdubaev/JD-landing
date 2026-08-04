import type { Metadata } from "next";

import type { CatalogQuery } from "@/types/catalog";

import { absoluteUrl, absoluteUrlWithQuery } from "./url";

export type CatalogMetadataInput = {
  query: CatalogQuery;
  total: number;
  basePath: string;
  title: string;
  description?: string | null;
  image?: string | null;
  /** When false, force noindex (e.g. CMS-managed is_indexable = false). */
  indexable?: boolean;
  /** Absolute canonical URL override (e.g. CMS-managed canonical_url). */
  canonicalPathOverride?: string | null;
};

/**
 * Build metadata for catalog and category pages following the canonical/robots matrix:
 *
 * - page 1 without params → index, self-canonical
 * - page 1 with ?page=1 → handled by redirect upstream
 * - page N > 1 (within range) → index, self-canonical with page=N, title includes page number
 * - page out of range → caller should call notFound() before reaching here
 * - search query → noindex,follow, canonical to base
 * - sort/filter params (non-whitelist) → noindex,follow, canonical to base
 * - indexable=false (CMS) → noindex,follow, canonical respected
 */
export function buildCatalogMetadata({
  query,
  basePath,
  title,
  description,
  image,
  indexable = true,
  canonicalPathOverride,
}: Omit<CatalogMetadataInput, "total">): Metadata {
  const hasSearch = query.search.trim().length > 0;
  const hasSortOrFilter =
    query.sort !== "relevance" ||
    query.availability !== undefined ||
    query.priceStatus !== undefined;
  const isPage1 = query.page <= 1;
  const isNoindex = hasSearch || hasSortOrFilter || !indexable;

  // Canonical: explicit override wins; otherwise self for page N, base for
  // search/sort/filter/page-1.
  let canonicalPath: string;
  if (canonicalPathOverride) {
    canonicalPath = canonicalPathOverride;
  } else if (isNoindex || isPage1) {
    canonicalPath = absoluteUrl(basePath);
  } else {
    canonicalPath = absoluteUrlWithQuery(basePath, { page: query.page });
  }

  const pageTitle = isPage1
    ? title
    : `${title} — страница ${query.page}`;

  const meta: Metadata = {
    title: pageTitle,
    description: description ?? undefined,
    alternates: { canonical: canonicalPath },
  };

  if (isNoindex) {
    meta.robots = { index: false, follow: true };
  }

  if (image) {
    meta.openGraph = {
      title: pageTitle,
      description: description ?? undefined,
      type: "website",
      url: canonicalPath,
      images: [image],
    };
  }

  return meta;
}

/** Check if the requested page is out of range and should 404. */
export function isPageOutOfRange(query: CatalogQuery, total: number): boolean {
  if (query.page <= 1) return false;
  const totalPages = Math.ceil(total / query.pageSize);
  return query.page > totalPages;
}