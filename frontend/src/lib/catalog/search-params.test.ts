import { describe, expect, it } from "vitest";

import { parseCatalogSearchParams } from "./search-params";

describe("parseCatalogSearchParams", () => {
  it("normalizes supported catalog state", () => {
    expect(
      parseCatalogSearchParams({
        q: "  карданный вал  ",
        page: "3",
        availability: "in_stock",
        price: "on_request",
        sort: "price_desc",
        category: "transmissiya-i-mosty",
      }),
    ).toEqual({
      search: "карданный вал",
      page: 3,
      pageSize: 24,
      availability: "in_stock",
      priceStatus: "on_request",
      categorySlug: "transmissiya-i-mosty",
      sort: "price_desc",
    });
  });

  it("drops unsupported filters and clamps an invalid page", () => {
    expect(
      parseCatalogSearchParams({
        page: "-10",
        availability: "warehouse",
        price: "free",
        sort: "random",
        category: "../../private",
      }),
    ).toEqual({
      search: "",
      page: 1,
      pageSize: 24,
      sort: "relevance",
    });
  });

  it("uses the first value when Next.js supplies an array", () => {
    expect(parseCatalogSearchParams({ q: ["редуктор", "ignored"] }).search).toBe(
      "редуктор",
    );
  });
});
