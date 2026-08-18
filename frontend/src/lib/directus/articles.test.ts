import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentDocument } from "@/lib/articles/structured-content";

import { directusEnvelopeRequest, directusRequest } from "./client";
import {
  getArticleBySlug,
  getArticlesPage,
  getFeaturedArticles,
  resolveArticleRelations,
} from "./articles";

vi.mock("./client", () => ({
  directusRequest: vi.fn(),
  directusEnvelopeRequest: vi.fn(),
}));

const requestMock = vi.mocked(directusRequest);
const envelopeRequestMock = vi.mocked(directusEnvelopeRequest);

describe("article queries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads three featured published articles in editorial order", async () => {
    requestMock.mockResolvedValue([]);
    await getFeaturedArticles(3);
    const url = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    expect(url.searchParams.get("filter[status][_eq]")).toBe("published");
    expect(url.searchParams.get("filter[is_featured][_eq]")).toBe("true");
    expect(url.searchParams.get("sort")).toBe("sort_order,-published_at");
    expect(url.searchParams.get("limit")).toBe("3");
  });

  it("paginates published articles by twelve", async () => {
    envelopeRequestMock.mockResolvedValue({
      data: [
        {
          id: "article-1",
          title: "Подбор запчасти",
          slug: "parts-selection",
          excerpt: "Короткая инструкция.",
          cover_image: null,
          image_alt: null,
          published_at: "2026-07-10T09:00:00.000Z",
          category_label: "Подбор запчастей",
          reading_time_minutes: 4,
        },
      ],
      meta: { filter_count: 25 },
    });
    const result = await getArticlesPage(2);
    const url = new URL(envelopeRequestMock.mock.calls[0][0], "https://cms.test");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("limit")).toBe("12");
    expect(result.total).toBe(25);
    expect(result.totalPages).toBe(3);
    expect(result.items[0]).toMatchObject({
      categoryLabel: "Подбор запчастей",
      readingTimeMinutes: 4,
    });
  });

  it("does not expose draft or unknown article slugs", async () => {
    requestMock.mockResolvedValue([]);
    expect(await getArticleBySlug("draft")).toBeNull();
    const url = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    expect(url.searchParams.get("filter[status][_eq]")).toBe("published");
    expect(url.searchParams.get("filter[slug][_eq]")).toBe("draft");
  });
});

const rawDetailArticle = {
  id: "article-1",
  title: "Подбор запчасти",
  slug: "parts-selection",
  excerpt: "Короткая инструкция.",
  content: "<h2>HTML</h2><p>Текст.</p>",
  cover_image: null,
  image_alt: null,
  published_at: "2026-07-10T09:00:00.000Z",
  category_label: null,
  reading_time_minutes: null,
  author: null,
  reviewer: null,
  sources: null,
  seo_title: null,
  seo_description: null,
  og_image: null,
  seo: null,
  updated_at: null,
};

describe("article detail structured content", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requests content_blocks in the detail query with bounded fields and no junction expansion", async () => {
    requestMock.mockResolvedValue([{ ...rawDetailArticle, content_blocks: null }]);
    const article = await getArticleBySlug("parts-selection");

    const url = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    const fields = url.searchParams.get("fields") ?? "";
    expect(fields).toContain("content_blocks");
    // The junction is fetched failure-isolated in resolveArticleRelations, so
    // the shared detail query must not expand editor_nodes.
    expect(fields).not.toContain("editor_nodes");
    expect(fields).not.toContain("*");
    expect(url.searchParams.get("limit")).toBe("1");
    expect(article?.contentBlocks).toBeNull();
  });

  it("keeps content_blocks null on the HTML fallback path", async () => {
    requestMock.mockResolvedValue([{ ...rawDetailArticle, content_blocks: null }]);
    const article = await getArticleBySlug("parts-selection");
    expect(article?.contentBlocks).toBeNull();
  });

  it("requests the additive seo field in the detail query", async () => {
    requestMock.mockResolvedValue([{ ...rawDetailArticle }]);
    await getArticleBySlug("parts-selection");
    const url = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    const fields = url.searchParams.get("fields") ?? "";
    expect(fields).toContain("seo");
    expect(fields).toContain("og_image");
  });

  it("maps a scalar-only article exactly as before the dual-read (seo null)", async () => {
    requestMock.mockResolvedValue([
      {
        ...rawDetailArticle,
        seo_title: "Скалярный заголовок статьи",
        seo_description: "Скалярное описание",
        og_image: "scalar-og-file",
      },
    ]);
    const article = await getArticleBySlug("parts-selection");

    // The R11 production-safety property: with seo = null the mapped SEO
    // output is byte-identical to the pre-dual-read scalar mapping.
    expect(article).toEqual(
      expect.objectContaining({
        seoTitle: "Скалярный заголовок статьи",
        seoDescription: "Скалярное описание",
        ogImageId: "scalar-og-file",
        seo: null,
      }),
    );
  });

  it("lets the plugin JSON win over conflicting article scalars", async () => {
    requestMock.mockResolvedValue([
      {
        ...rawDetailArticle,
        seo_title: "Скалярный заголовок",
        seo_description: "Скалярное описание",
        og_image: "scalar-og-file",
        seo: {
          title: "JSON-заголовок",
          meta_description: "JSON-описание",
          og_image: "json-og-file",
        },
      },
    ]);
    const article = await getArticleBySlug("parts-selection");

    expect(article).toEqual(
      expect.objectContaining({
        seoTitle: "JSON-заголовок",
        seoDescription: "JSON-описание",
        ogImageId: "json-og-file",
        seo: { title: "JSON-заголовок", meta_description: "JSON-описание", og_image: "json-og-file" },
      }),
    );
  });

  it("merges a partial article JSON with the scalars per key and degrades corrupted JSON", async () => {
    requestMock.mockResolvedValueOnce([
      {
        ...rawDetailArticle,
        seo_title: "Скалярный заголовок",
        seo_description: "Скалярное описание",
        // Only the description key is usable in the JSON.
        seo: { title: "   ", meta_description: "JSON-описание" },
      },
    ]);
    const partial = await getArticleBySlug("parts-selection");
    expect(partial).toEqual(
      expect.objectContaining({
        seoTitle: "Скалярный заголовок",
        seoDescription: "JSON-описание",
      }),
    );

    // A corrupted string seo degrades entirely to the scalars.
    requestMock.mockResolvedValueOnce([
      {
        ...rawDetailArticle,
        seo_title: "Скалярный заголовок",
        seo_description: "Скалярное описание",
        seo: "garbage",
      },
    ]);
    const corrupted = await getArticleBySlug("parts-selection");
    expect(corrupted).toEqual(
      expect.objectContaining({
        seoTitle: "Скалярный заголовок",
        seoDescription: "Скалярное описание",
        seo: null,
      }),
    );
  });

  it("adapts flexible-editor relation nodes to the renderer contract", async () => {
    requestMock.mockResolvedValue([
      {
        ...rawDetailArticle,
        content_blocks: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Введение." }] },
            {
              type: "relationBlock",
              attrs: {
                id: "junction-1",
                junction: "editor_nodes",
                collection: "products",
              },
            },
            {
              type: "relationInlineBlock",
              attrs: {
                id: "junction-2",
                junction: "editor_nodes",
                collection: "categories",
              },
            },
            {
              type: "relationBlock",
              attrs: {
                id: "junction-3",
                junction: "editor_nodes",
                collection: "unknown_collection",
              },
            },
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Оформить заявку",
                  marks: [
                    {
                      type: "relationMark",
                      attrs: {
                        id: "junction-4",
                        junction: "editor_nodes",
                        collection: "products",
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ]);
    const article = await getArticleBySlug("parts-selection");
    const blocks = article?.contentBlocks as {
      type: string;
      content: Array<Record<string, unknown> & { type: string }>;
    };
    if (!blocks || blocks.type !== "doc") throw new Error("expected doc");

    expect(blocks.content[1]).toEqual({
      type: "productRelation",
      attrs: { id: "junction-1" },
    });
    expect(blocks.content[2]).toEqual({
      type: "categoryRelation",
      attrs: { id: "junction-2" },
    });
    // Unsupported target collection stays untouched for the parser to
    // normalise into a non-executable unknown node.
    expect(blocks.content[3]).toMatchObject({ type: "relationBlock" });
    // relationMark degrades to plain text (renderer has no inline relations).
    const markedParagraph = blocks.content[4] as unknown as {
      content: Array<{ text: string; marks?: unknown[] }>;
    };
    expect(markedParagraph.content[0].text).toBe("Оформить заявку");
    expect(markedParagraph.content[0].marks).toHaveLength(0);
  });
});

describe("resolveArticleRelations", () => {
  beforeEach(() => vi.clearAllMocks());

  const documentWithRefs = (kind: "product" | "category", id: string) =>
    ({
      type: "doc",
      content: [{ type: `${kind}Relation`, attrs: { id } }],
    }) as unknown as ContentDocument;

  it("skips every request when the document holds no relations", async () => {
    const document = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "текст" }] }],
    } as unknown as ContentDocument;

    expect(await resolveArticleRelations("article-1", document)).toBeUndefined();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("resolves relations via bounded junction and per-collection queries", async () => {
    requestMock
      .mockResolvedValueOnce([
        { id: "junction-1", collection: "products", item: "product-9" },
        { id: "junction-2", collection: "categories", item: "category-7" },
        { id: "junction-3", collection: "products", item: "product-8" },
      ])
      .mockResolvedValueOnce([
        {
          id: "product-9",
          slug: "mufta-kompressora",
          title: "Муфта компрессора John Deere",
          sku: "RE504836",
          price_status: "on_request",
          availability_status: "on_request",
          category: { slug: "clutches", title: "Муфты" },
        },
        {
          id: "product-8",
          slug: "product-no-category",
          title: "Товар без категории",
          sku: "SKU-1",
          price_status: "hidden",
          availability_status: "out_of_stock",
          category: null,
        },
      ])
      .mockResolvedValueOnce([
        { id: "category-7", slug: "clutches", title: "Муфты" },
      ]);

    const document = {
      type: "doc",
      content: [
        { type: "productRelation", attrs: { id: "junction-1" } },
        { type: "productRelation", attrs: { id: "junction-3" } },
        { type: "categoryRelation", attrs: { id: "junction-2" } },
        { type: "productRelation", attrs: { id: "junction-missing" } },
      ],
    } as unknown as ContentDocument;
    const resolve = await resolveArticleRelations("article-1", document);
    if (!resolve) throw new Error("expected resolver");

    const junctionUrl = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    expect(requestMock.mock.calls[0][0]).toContain("/items/articles_editor_nodes");
    expect(junctionUrl.searchParams.get("filter[articles_id][_eq]")).toBe("article-1");
    expect(junctionUrl.searchParams.get("fields")).toBe("id,collection,item");
    expect(junctionUrl.searchParams.get("limit")).toBe("50");

    const productsUrl = new URL(requestMock.mock.calls[1][0], "https://cms.test");
    expect(requestMock.mock.calls[1][0]).toContain("/items/products");
    expect(productsUrl.searchParams.get("filter[id][_in]")).toBe(
      "product-9,product-8",
    );
    expect(productsUrl.searchParams.get("fields")).toBe(
      "id,slug,title,sku,price_status,availability_status,category.slug,category.title",
    );
    expect(productsUrl.searchParams.get("limit")).toBe("2");

    const categoriesUrl = new URL(requestMock.mock.calls[2][0], "https://cms.test");
    expect(requestMock.mock.calls[2][0]).toContain("/items/categories");
    expect(categoriesUrl.searchParams.get("fields")).toBe("id,slug,title");
    expect(categoriesUrl.searchParams.get("limit")).toBe("1");

    expect(resolve({ kind: "product", id: "junction-1" })).toEqual({
      kind: "product",
      title: "Муфта компрессора John Deere",
      url: "/catalog/clutches/mufta-kompressora",
      priceLabel: "Цена по запросу",
    });
    expect(resolve({ kind: "product", id: "junction-3" })).toEqual({
      kind: "product",
      title: "Товар без категории",
      url: "/contacts#consultation",
      priceLabel: "Уточнить условия",
    });
    expect(resolve({ kind: "category", id: "junction-2" })).toEqual({
      kind: "category",
      title: "Муфты",
      url: "/catalog/clutches",
    });
    // Stale reference without a junction row stays unresolved (renderer shows
    // nothing executable in public mode).
    expect(resolve({ kind: "product", id: "junction-missing" })).toBeUndefined();
  });

  it("degrades safely when the junction query fails (missing role permission)", async () => {
    requestMock.mockRejectedValueOnce(new Error("403"));

    const resolve = await resolveArticleRelations(
      "article-1",
      documentWithRefs("product", "junction-1"),
    );
    if (!resolve) throw new Error("expected resolver");
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(resolve({ kind: "product", id: "junction-1" })).toBeUndefined();
  });

  it("caps relation queries at the bounded limit instead of limit=-1", async () => {
    const content = Array.from({ length: 60 }, (_, index) => ({
      type: "productRelation",
      attrs: { id: `junction-${index}` },
    }));
    requestMock
      .mockResolvedValueOnce(
        content.map((node, index) => ({
          id: `junction-${index}`,
          collection: "products",
          item: `product-${index}`,
        })),
      )
      .mockResolvedValueOnce([]);

    await resolveArticleRelations("article-1", {
      type: "doc",
      content,
    } as unknown as ContentDocument);

    const productsUrl = new URL(requestMock.mock.calls[1][0], "https://cms.test");
    const requested = (productsUrl.searchParams.get("filter[id][_in]") ?? "").split(",");
    expect(requested).toHaveLength(50);
    expect(productsUrl.searchParams.get("limit")).toBe("50");
    expect(productsUrl.searchParams.get("limit")).not.toBe("-1");
  });
});
