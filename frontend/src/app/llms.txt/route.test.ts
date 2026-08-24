import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCategoriesMock, getFeaturedArticlesMock } = vi.hoisted(() => ({
  getCategoriesMock: vi.fn(),
  getFeaturedArticlesMock: vi.fn(),
}));

vi.mock("@/lib/directus/catalog", () => ({
  getCategories: getCategoriesMock,
}));

vi.mock("@/lib/directus/articles", () => ({
  getFeaturedArticles: getFeaturedArticlesMock,
}));

import { GET } from "./route";

describe("GET /llms.txt", () => {
  beforeEach(() => {
    getCategoriesMock.mockResolvedValue([
      { title: "Гидравлика", slug: "gidravlika", isIndexable: true },
      { title: "Скрытая категория", slug: "hidden", isIndexable: false },
    ]);
    getFeaturedArticlesMock.mockResolvedValue([
      { id: "a1", title: "Как подобрать фильтр", slug: "kak-podobrat-filtr" },
    ]);
  });

  it("lists indexable category and article links with procurement boundaries", async () => {
    const response = await GET();
    const body = await response.text();

    expect(response.headers.get("Content-Type")).toContain("text/plain");
    expect(body).toContain("[Гидравлика](https://deere-shop.ru/catalog/gidravlika)");
    expect(body).toContain("[Как подобрать фильтр](https://deere-shop.ru/articles/kak-podobrat-filtr)");
    expect(body).not.toContain("hidden");
    expect(body).toContain("Цены, наличие и совместимость подтверждаются перед заказом.");
  });
});
