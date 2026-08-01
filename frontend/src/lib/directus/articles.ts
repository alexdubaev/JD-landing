import "server-only";

import type {
  Article,
  ArticleCardData,
  ArticlePage,
} from "@/types/catalog";

import { directusEnvelopeRequest, directusRequest } from "./client";

type FileRelation = string | { id: string } | null;

type RawArticle = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content?: string;
  cover_image: FileRelation;
  image_alt: string | null;
  published_at: string;
  category_label?: string | null;
  reading_time_minutes?: string | number | null;
  seo_title?: string | null;
  seo_description?: string | null;
  og_image?: FileRelation;
  updated_at?: string | null;
};

const fileId = (relation: FileRelation | undefined) =>
  typeof relation === "string" ? relation : (relation?.id ?? null);

const cardFields =
  "id,title,slug,excerpt,cover_image,image_alt,published_at,category_label,reading_time_minutes";
const detailFields = `${cardFields},content,seo_title,seo_description,og_image,updated_at`;

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

const mapArticle = (raw: RawArticle): Article => ({
  ...mapCard(raw),
  content: raw.content ?? "",
  seoTitle: raw.seo_title ?? null,
  seoDescription: raw.seo_description ?? null,
  ogImageId: fileId(raw.og_image),
  updatedAt: raw.updated_at ?? null,
});

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
