import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Article } from "@/types/catalog";

import ArticlePage, { generateMetadata } from "./page";

const {
  getArticleBySlugMock,
  getRelatedArticlesMock,
  notFoundMock,
} = vi.hoisted(() => ({
  getArticleBySlugMock: vi.fn(),
  getRelatedArticlesMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
}));

vi.mock("@/lib/directus/articles", () => ({
  getArticleBySlug: getArticleBySlugMock,
  getRelatedArticles: getRelatedArticlesMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

const article: Article = {
  id: "article-1",
  title: "Как подготовить данные для подбора",
  slug: "prepare-selection-data",
  excerpt: "Краткий список данных для точного запроса.",
  content:
    '<h2>Что подготовить</h2><p>Артикул и модель.</p><script>alert("x")</script>',
  coverImageId: null,
  imageAlt: null,
  publishedAt: "2026-07-29T10:00:00.000Z",
  seoTitle: "Подготовка данных для подбора",
  seoDescription: "Памятка перед отправкой запроса.",
  ogImageId: null,
  updatedAt: "2026-07-30T10:00:00.000Z",
};

describe("article page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getArticleBySlugMock.mockResolvedValue(article);
    getRelatedArticlesMock.mockResolvedValue([]);
  });

  it("renders sanitized published content and Article/Breadcrumb JSON-LD", async () => {
    const { container } = render(
      await ArticlePage({
        params: Promise.resolve({ slug: article.slug }),
      }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      article.title,
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Что подготовить",
    );
    expect(container.querySelector("script:not([type='application/ld+json'])"))
      .not.toBeInTheDocument();
    const schemas = [
      ...container.querySelectorAll("script[type='application/ld+json']"),
    ].map((node) => JSON.parse(node.textContent ?? "{}"));
    expect(schemas.map((schema) => schema["@type"])).toEqual([
      "Article",
      "BreadcrumbList",
    ]);
  });

  it("returns canonical metadata for a published article", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: article.slug }),
    });

    expect(metadata.alternates?.canonical).toBe(
      `/articles/${article.slug}`,
    );
    expect(metadata.openGraph).toMatchObject({ type: "article" });
  });

  it("uses the not-found boundary for unknown or draft slugs", async () => {
    getArticleBySlugMock.mockResolvedValue(null);

    await expect(
      ArticlePage({
        params: Promise.resolve({ slug: "draft-or-unknown" }),
      }),
    ).rejects.toThrow("404");
    expect(notFoundMock).toHaveBeenCalledOnce();
    expect(getRelatedArticlesMock).not.toHaveBeenCalled();
  });
});
