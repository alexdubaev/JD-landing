import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Article } from "@/types/catalog";

import ArticlePage, { generateMetadata } from "./page";

const {
  getArticleBySlugMock,
  getRelatedArticlesMock,
  notFoundMock,
  resolveArticleRelationsMock,
} = vi.hoisted(() => ({
  getArticleBySlugMock: vi.fn(),
  getRelatedArticlesMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
  resolveArticleRelationsMock: vi.fn(),
}));

vi.mock("@/lib/directus/articles", () => ({
  getArticleBySlug: getArticleBySlugMock,
  getRelatedArticles: getRelatedArticlesMock,
  resolveArticleRelations: resolveArticleRelationsMock,
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
    resolveArticleRelationsMock.mockResolvedValue(undefined);
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

  it("keeps the HTML fallback branch unchanged when content_blocks is null (no relation fetch)", async () => {
    // Live articles today: content_blocks = null → the page must render the
    // sanitized content div exactly as before and never resolve relations.
    const { container } = render(
      await ArticlePage({
        params: Promise.resolve({ slug: article.slug }),
      }),
    );

    const content = container.querySelector(".article-content");
    expect(content).not.toBeNull();
    expect(content?.innerHTML).toContain("<h2>Что подготовить</h2>");
    expect(content?.innerHTML).toContain("<p>Артикул и модель.</p>");
    expect(content?.innerHTML).not.toContain("script");
    expect(resolveArticleRelationsMock).not.toHaveBeenCalled();
  });

  it("falls back to the HTML branch for invalid content_blocks JSON", async () => {
    getArticleBySlugMock.mockResolvedValue({
      ...article,
      contentBlocks: "not-a-document",
    });

    const { container } = render(
      await ArticlePage({
        params: Promise.resolve({ slug: article.slug }),
      }),
    );

    expect(container.querySelector(".article-content")?.innerHTML).toContain(
      "<h2>Что подготовить</h2>",
    );
    expect(resolveArticleRelationsMock).not.toHaveBeenCalled();
  });

  it("renders the structured branch with resolved relations when content_blocks is valid", async () => {
    const contentBlocks = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Подбор из редактора" }],
        },
        { type: "productRelation", attrs: { id: "junction-1" } },
      ],
    };
    getArticleBySlugMock.mockResolvedValue({
      ...article,
      contentBlocks,
    });
    resolveArticleRelationsMock.mockResolvedValue((ref: { kind: string; id: string }) =>
      ref.kind === "product" && ref.id === "junction-1"
        ? {
            kind: "product",
            title: "Муфта компрессора John Deere",
            url: "/catalog/clutches/john-deere-clutch",
            priceLabel: "Цена по запросу",
          }
        : undefined,
    );

    const { container } = render(
      await ArticlePage({
        params: Promise.resolve({ slug: article.slug }),
      }),
    );

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Подбор из редактора",
    );
    const productLink = screen.getByRole("link", {
      name: /Муфта компрессора John Deere/i,
    });
    expect(productLink).toHaveAttribute(
      "href",
      "/catalog/clutches/john-deere-clutch",
    );
    expect(screen.getByText("Цена по запросу")).toBeInTheDocument();
    // The HTML fallback is not rendered alongside the structured document.
    expect(container.querySelector(".article-content")?.innerHTML).not.toContain(
      "Что подготовить",
    );
    expect(resolveArticleRelationsMock).toHaveBeenCalledWith(article.id, {
      type: "doc",
      content: expect.any(Array),
    });
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
