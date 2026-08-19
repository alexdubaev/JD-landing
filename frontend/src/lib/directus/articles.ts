import "server-only";

import type {
  ContentDocument,
  RelationResolver,
} from "@/lib/articles/structured-content";
import { extractRelationRefs } from "@/lib/articles/structured-content";
import type {
  Article,
  ArticleCardData,
  ArticlePage,
} from "@/types/catalog";
import { parseSeoJson, resolveSeo } from "@/lib/seo/directus-seo";

import { directusEnvelopeRequest, directusRequest, directusVersionedRequest, readPreviewContext } from "./client";

type FileRelation = string | { id: string } | null;

type RawArticle = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content?: string;
  content_blocks?: unknown;
  cover_image: FileRelation;
  image_alt: string | null;
  published_at: string;
  category_label?: string | null;
  reading_time_minutes?: string | number | null;
  author?: string | null;
  reviewer?: string | null;
  sources?: unknown;
  seo_title?: string | null;
  seo_description?: string | null;
  og_image?: FileRelation;
  /** R11 additive plugin JSON (null until the CMS migration fills it). */
  seo?: unknown;
  updated_at?: string | null;
};

const fileId = (relation: FileRelation | undefined) =>
  typeof relation === "string" ? relation : (relation?.id ?? null);

const sourceList = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const cardFields =
  "id,title,slug,excerpt,cover_image,image_alt,published_at,category_label,reading_time_minutes";
// `editor_nodes` (junction rows) is deliberately NOT part of this query: the
// Frontend API role has no read permission on `articles_editor_nodes` yet, and
// a nested field the role cannot read would fail the whole request. Junction
// rows are fetched separately (failure-isolated) in resolveArticleRelations.
const detailFields = `${cardFields},content,content_blocks,author,reviewer,sources,seo_title,seo_description,og_image,seo,updated_at`;

const queryString = (parameters: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(parameters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, value);
  });
  return search.toString();
};

const mapCard = (raw: RawArticle): ArticleCardData => ({
  id: raw.id,
  title: raw.title,
  slug: raw.slug,
  excerpt: raw.excerpt,
  coverImageId: fileId(raw.cover_image),
  imageAlt: raw.image_alt,
  publishedAt: raw.published_at,
  categoryLabel: raw.category_label?.trim() || null,
  readingTimeMinutes:
    typeof raw.reading_time_minutes === "number" &&
    Number.isInteger(raw.reading_time_minutes) &&
    raw.reading_time_minutes > 0
      ? raw.reading_time_minutes
      : typeof raw.reading_time_minutes === "string" &&
          /^\d+$/u.test(raw.reading_time_minutes) &&
          Number(raw.reading_time_minutes) > 0
        ? Number(raw.reading_time_minutes)
        : null,
});

const mapArticle = (raw: RawArticle): Article => {
  // R11 dual-read: plugin JSON first, scalar SEO fields as per-key fallback.
  // While seo is null this reproduces the previous scalar mapping exactly.
  const seo = resolveSeo(raw, {
    title: raw.seo_title ?? null,
    description: raw.seo_description ?? null,
    ogImageFileId: fileId(raw.og_image),
  });
  return {
    ...mapCard(raw),
    content: raw.content ?? "",
    contentBlocks: adaptEditorBlocks(raw.content_blocks ?? null),
    author: raw.author ?? null,
    reviewer: raw.reviewer ?? null,
    sources: sourceList(raw.sources),
    seoTitle: seo.title,
    seoDescription: seo.description,
    ogImageId: seo.ogImageFileId,
    seo: parseSeoJson(raw.seo),
    updatedAt: raw.updated_at ?? null,
  };
};

// ---------------------------------------------------------------------------
// Flexible Editor JSON → renderer contract
// ---------------------------------------------------------------------------

/**
 * Node types the Flexible Editor stores for relations (see
 * docs/reports/directus-flexible-editor-1.9.0-pilot.md). Their attrs hold only
 * a reference `{ id, junction, collection }` where `id` is the junction row id
 * in `articles_editor_nodes`.
 */
const editorRelationNodeTypes: ReadonlySet<string> = new Set([
  "relationBlock",
  "relationInlineBlock",
]);
const editorRelationMarkType = "relationMark";
const editorRelationCollections: Record<string, "product" | "category"> = {
  products: "product",
  categories: "category",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const MAX_ADAPT_DEPTH = 64;

/**
 * Normalises canonical Flexible Editor JSON into the node contract of the
 * structured renderer (`@/lib/articles/structured-content.ts`):
 *
 *  - `relationBlock` / `relationInlineBlock` with `collection: "products"` →
 *    `productRelation`, `"categories"` → `categoryRelation`; only the junction
 *    id is kept, other targets are left untouched (the parser turns them into
 *    a non-executable unknown node).
 *  - `relationMark` is dropped while its text content is preserved (the
 *    renderer's inline contract has no relation marks yet); inline relation
 *    CTAs therefore degrade safely to plain text.
 *
 * The function never throws and never widens the document: unknown shapes pass
 * through unchanged for the parser to reject safely.
 */
function adaptEditorBlocks(input: unknown, depth = 0): unknown {
  if (depth > MAX_ADAPT_DEPTH) return input;
  if (Array.isArray(input)) {
    return input.map((item) => adaptEditorBlocks(item, depth + 1));
  }
  if (!isRecord(input)) return input;

  if (typeof input.type === "string" && editorRelationNodeTypes.has(input.type)) {
    const attrs = isRecord(input.attrs) ? input.attrs : {};
    const id = typeof attrs.id === "string" && attrs.id.trim().length > 0
      ? attrs.id
      : null;
    const collection = typeof attrs.collection === "string"
      ? attrs.collection
      : null;
    const kind =
      collection !== null ? editorRelationCollections[collection] : undefined;
    if (id !== null && kind === "product") {
      return { type: "productRelation", attrs: { id } };
    }
    if (id !== null && kind === "category") {
      return { type: "categoryRelation", attrs: { id } };
    }
    return input;
  }

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    output[key] =
      key === "marks" && Array.isArray(value)
        ? value.filter(
            (mark) =>
              !(isRecord(mark) && mark.type === editorRelationMarkType),
          )
        : adaptEditorBlocks(value, depth + 1);
  }
  return output;
}

// ---------------------------------------------------------------------------
// Relation resolution (bounded, failure-isolated)
// ---------------------------------------------------------------------------

/** One `articles_editor_nodes` junction row: relation target reference. */
type EditorNodeTarget = {
  id: string;
  collection: string | null;
  item: string | null;
};

type RelationProductDatum = {
  id: string;
  slug: string;
  title: string;
  sku: string | null;
  price_status: string | null;
  availability_status: string | null;
  category: { slug: string | null; title: string | null } | null;
};

type RelationCategoryDatum = {
  id: string;
  slug: string;
  title: string;
};

const junctionFields = "id,collection,item";
const relationProductFields =
  "id,slug,title,sku,price_status,availability_status,category.slug,category.title";
const relationCategoryFields = "id,slug,title";
/** Hard upper bound for every relation query. Never `-1`. */
const relationQueryLimit = 50;

const relationPriceLabel = (product: RelationProductDatum): string | undefined => {
  if (product.price_status === "on_request") return "Цена по запросу";
  if (product.price_status === "hidden") return "Уточнить условия";
  return undefined;
};

async function fetchRelationProducts(
  ids: string[],
): Promise<RelationProductDatum[]> {
  if (ids.length === 0) return [];
  const query = queryString({
    "filter[id][_in]": ids.join(","),
    fields: relationProductFields,
    limit: String(Math.min(ids.length, relationQueryLimit)),
  });
  return directusRequest<RelationProductDatum[]>(
    `/items/products?${query}`,
    { next: { revalidate: 300, tags: ["products"] } },
  ).catch(() => []);
}

async function fetchRelationCategories(
  ids: string[],
): Promise<RelationCategoryDatum[]> {
  if (ids.length === 0) return [];
  const query = queryString({
    "filter[id][_in]": ids.join(","),
    fields: relationCategoryFields,
    limit: String(Math.min(ids.length, relationQueryLimit)),
  });
  return directusRequest<RelationCategoryDatum[]>(
    `/items/categories?${query}`,
    { next: { revalidate: 300, tags: ["categories"] } },
  ).catch(() => []);
}

/**
 * Resolves the relation references of a parsed structured document against
 * current data and returns a synchronous {@link RelationResolver} for the
 * renderer.
 *
 * The Flexible Editor stores the junction row id in each relation node, so the
 * resolution hop is: junction rows of the article (bounded `fields`, `limit`)
 * → one bounded query per target collection (products / categories). Every
 * request is failure-isolated: when a query fails (for example while the
 * Frontend API role has no junction read permission yet), the affected
 * relations simply stay unresolved and the renderer shows nothing executable
 * in public mode. Returns `undefined` when the document holds no relations.
 */
export async function resolveArticleRelations(
  articleId: string,
  document: ContentDocument,
): Promise<RelationResolver | undefined> {
  const refs = extractRelationRefs(document);
  if (refs.length === 0) return undefined;

  const junctionQuery = queryString({
    "filter[articles_id][_eq]": articleId,
    fields: junctionFields,
    limit: String(relationQueryLimit),
  });
  const junctions = await directusRequest<EditorNodeTarget[]>(
    `/items/articles_editor_nodes?${junctionQuery}`,
    { next: { revalidate: 300, tags: ["articles"] } },
  ).catch(() => []);
  const junctionById = new Map(junctions.map((row) => [row.id, row]));

  const productIds = new Set<string>();
  const categoryIds = new Set<string>();
  for (const ref of refs) {
    const row = junctionById.get(ref.id);
    if (!row || typeof row.item !== "string" || row.item.length === 0) continue;
    if (ref.kind === "product" && row.collection === "products") {
      productIds.add(row.item);
    } else if (ref.kind === "category" && row.collection === "categories") {
      categoryIds.add(row.item);
    }
  }

  const [products, categories] = await Promise.all([
    fetchRelationProducts([...productIds].slice(0, relationQueryLimit)),
    fetchRelationCategories([...categoryIds].slice(0, relationQueryLimit)),
  ]);
  const productsById = new Map(products.map((item) => [item.id, item]));
  const categoriesById = new Map(categories.map((item) => [item.id, item]));

  return (ref) => {
    const row = junctionById.get(ref.id);
    if (!row || typeof row.item !== "string" || row.item.length === 0) {
      return undefined;
    }
    if (ref.kind === "product" && row.collection === "products") {
      const product = productsById.get(row.item);
      if (!product) return undefined;
      return {
        kind: "product",
        title: product.title,
        url: product.category?.slug
          ? `/catalog/${product.category.slug}/${product.slug}`
          : "/contacts#consultation",
        priceLabel: relationPriceLabel(product),
      };
    }
    if (ref.kind === "category" && row.collection === "categories") {
      const category = categoriesById.get(row.item);
      if (!category) return undefined;
      return {
        kind: "category",
        title: category.title,
        url: `/catalog/${category.slug}`,
      };
    }
    return undefined;
  };
}

export async function getFeaturedArticles(limit = 3): Promise<ArticleCardData[]> {
  const safeLimit = Math.min(3, Math.max(1, Math.floor(limit)));
  const query = queryString({
    "filter[status][_eq]": "published",
    "filter[published_at][_lte]": "$NOW",
    "filter[is_featured][_eq]": "true",
    fields: cardFields,
    sort: "sort_order,-published_at",
    limit: String(safeLimit),
  });
  const featured = await directusRequest<RawArticle[]>(
    `/items/articles?${query}`,
    { next: { revalidate: 300, tags: ["articles", "homepage"] } },
  );
  if (featured.length >= safeLimit) return featured.map(mapCard);

  const fallbackQuery = queryString({
    "filter[status][_eq]": "published",
    "filter[published_at][_lte]": "$NOW",
    fields: cardFields,
    sort: "-published_at,sort_order",
    limit: String(safeLimit),
  });
  const latest = await directusRequest<RawArticle[]>(
    `/items/articles?${fallbackQuery}`,
    { next: { revalidate: 300, tags: ["articles", "homepage"] } },
  );
  const unique = new Map(
    [...featured, ...latest].map((article) => [article.id, article]),
  );
  return [...unique.values()].slice(0, safeLimit).map(mapCard);
}

export async function getArticlesPage(page: number): Promise<ArticlePage> {
  const safePage = Math.max(1, Math.floor(page));
  const pageSize = 12;
  const query = queryString({
    "filter[status][_eq]": "published",
    "filter[published_at][_lte]": "$NOW",
    fields: cardFields,
    sort: "-published_at,sort_order",
    page: String(safePage),
    limit: String(pageSize),
    meta: "filter_count",
  });
  const response = await directusEnvelopeRequest<RawArticle[]>(
    `/items/articles?${query}`,
    { next: { revalidate: 300, tags: ["articles"] } },
  );
  const total = response.meta?.filter_count ?? response.data.length;
  return {
    items: response.data.map(mapCard),
    total,
    page: safePage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  // Task 16 preview: with a valid draft context the article is read through
  // its version overlay. The version's own slug must match the requested one,
  // so a preview cookie for one article can never render on another URL.
  // Without a preview context the published fetch below stays byte-identical
  // to the pre-preview behaviour.
  const preview = await readPreviewContext();
  if (preview?.collection === "articles") {
    const raw = await directusVersionedRequest<RawArticle>(
      `/items/articles/${preview.id}?${queryString({ fields: detailFields })}`,
      { version: preview.version },
    );
    if (raw?.slug === slug) return mapArticle(raw);
  }

  const query = queryString({
    "filter[status][_eq]": "published",
    "filter[published_at][_lte]": "$NOW",
    "filter[slug][_eq]": slug,
    fields: detailFields,
    limit: "1",
  });
  const items = await directusRequest<RawArticle[]>(
    `/items/articles?${query}`,
    { next: { revalidate: 300, tags: ["articles", `article:${slug}`] } },
  );
  return items[0] ? mapArticle(items[0]) : null;
}

export async function getRelatedArticles(
  articleId: string,
  limit = 3,
): Promise<ArticleCardData[]> {
  const query = queryString({
    "filter[status][_eq]": "published",
    "filter[published_at][_lte]": "$NOW",
    "filter[id][_neq]": articleId,
    fields: cardFields,
    sort: "-published_at,sort_order",
    limit: String(Math.min(3, Math.max(1, limit))),
  });
  const items = await directusRequest<RawArticle[]>(
    `/items/articles?${query}`,
    { next: { revalidate: 300, tags: ["articles"] } },
  );
  return items.map(mapCard);
}

export async function getArticleSitemapEntries() {
  const query = queryString({
    "filter[status][_eq]": "published",
    "filter[published_at][_lte]": "$NOW",
    fields: "slug,updated_at",
    sort: "slug",
    limit: "-1",
  });
  return directusRequest<Array<{ slug: string; updated_at: string | null }>>(
    `/items/articles?${query}`,
    { next: { revalidate: 3600, tags: ["articles", "sitemap"] } },
  );
}
