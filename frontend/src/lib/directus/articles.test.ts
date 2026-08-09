import { beforeEach, describe, expect, it, vi } from "vitest";

import { directusEnvelopeRequest, directusRequest } from "./client";
import {
  getArticleBySlug,
  getArticlesPage,
  getFeaturedArticles,
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
