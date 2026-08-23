import { describe, expect, it } from "vitest";

import type { CatalogQuery } from "@/types/catalog";

import {
  buildCatalogMetadata,
  isPageOutOfRange,
} from "./catalog-metadata";

const baseQuery: CatalogQuery = {
  search: "",
  sort: "relevance",
  page: 1,
  pageSize: 12,
};

const baseArgs = {
  query: baseQuery,
  basePath: "/catalog",
  title: "Каталог продукции",
  description: "Описание каталога.",
};

describe("buildCatalogMetadata", () => {
  it("uses a non-empty fallback description when the CMS description is absent", () => {
    const meta = buildCatalogMetadata({
      ...baseArgs,
      description: null,
    });

    expect(meta.description).toBe(
      "Каталог комплектующих John Deere: поиск по названию и артикулу, подбор по модели техники и заявка на консультацию.",
    );
  });

  it("indexes page 1 without params and self-canonicalizes to the base", () => {
    const meta = buildCatalogMetadata(baseArgs);

    expect(meta.robots).toBeUndefined();
    expect(meta.alternates?.canonical).toBe("https://deere-shop.ru/catalog");
    expect(meta.openGraph).toMatchObject({
      title: "Каталог продукции",
      description: "Описание каталога.",
      type: "website",
      url: "https://deere-shop.ru/catalog",
    });
    expect(meta.twitter).toMatchObject({
      card: "summary",
      title: "Каталог продукции",
      description: "Описание каталога.",
    });
  });

  it("applies noindex,follow for search queries and canonicalizes to the base", () => {
    const meta = buildCatalogMetadata({
      ...baseArgs,
      query: { ...baseQuery, search: "фильтр" },
    });

    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates?.canonical).toBe("https://deere-shop.ru/catalog");
  });

  it("applies noindex,follow when indexable is false (CMS is_indexable)", () => {
    const meta = buildCatalogMetadata({
      ...baseArgs,
      indexable: false,
    });

    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("honors an explicit canonical override from the CMS", () => {
    const meta = buildCatalogMetadata({
      ...baseArgs,
      canonicalPathOverride: "https://deere-shop.ru/catalog-john-deere",
    });

    expect(meta.alternates?.canonical).toBe(
      "https://deere-shop.ru/catalog-john-deere",
    );
  });

  it("self-canonicalizes page N > 1 with a page suffix in the title", () => {
    const meta = buildCatalogMetadata({
      ...baseArgs,
      query: { ...baseQuery, page: 3 },
    });

    expect(meta.title).toBe("Каталог продукции — страница 3");
    expect(meta.alternates?.canonical).toBe(
      "https://deere-shop.ru/catalog?page=3",
    );
    expect(meta.robots).toBeUndefined();
  });
});

describe("isPageOutOfRange", () => {
  it("returns false for page 1 regardless of total", () => {
    expect(isPageOutOfRange({ ...baseQuery, page: 1 }, 0)).toBe(false);
  });

  it("returns true when the page exceeds the computed total", () => {
    // pageSize 12, total 25 → 3 pages; page 4 is out of range.
    expect(
      isPageOutOfRange({ ...baseQuery, page: 4 }, 25),
    ).toBe(true);
    expect(
      isPageOutOfRange({ ...baseQuery, page: 3 }, 25),
    ).toBe(false);
  });
});
