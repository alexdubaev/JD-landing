import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductCardData } from "@/types/catalog";

import {
  DirectusRequestError,
  directusEnvelopeRequest,
  directusRequest,
} from "./client";
import {
  fetchProductSuggestions,
  getCatalogPage,
  getCategories,
  getFeaturedProducts,
  getHomepageCategories,
} from "./catalog";

vi.mock("./client", async () => {
  const actual = await vi.importActual<typeof import("./client")>("./client");
  return {
    ...actual,
    directusRequest: vi.fn(),
    directusEnvelopeRequest: vi.fn(),
  };
});

const requestMock = vi.mocked(directusRequest);
const envelopeRequestMock = vi.mocked(directusEnvelopeRequest);

describe("catalog queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads only published categories and maps their icon", async () => {
    requestMock.mockResolvedValue([
      {
        id: "engine",
        title: "Двигатель",
        slug: "engine",
        parent: null,
        description: null,
        image: null,
        image_alt: null,
        icon: "icon-file",
        icon_alt: "Поршень и коленвал",
        h1: null,
        seo_title: null,
        seo_description: null,
        seo_text: null,
        og_image: null,
      },
    ]);

    const categories = await getCategories();

    const [path] = requestMock.mock.calls[0];
    const url = new URL(path, "https://cms.example.test");
    expect(url.searchParams.get("filter[status][_eq]")).toBe("published");
    expect(url.searchParams.get("sort")).toBe("sort_order,title");
    expect(url.searchParams.get("fields")).toContain("icon_alt");
    expect(categories[0]).toMatchObject({
      iconId: "icon-file",
      iconAlt: "Поршень и коленвал",
    });
  });

  it("encodes catalog search, filters, sorting, and pagination", async () => {
    envelopeRequestMock.mockResolvedValue({
      data: [],
      meta: { filter_count: 49 },
    });

    const result = await getCatalogPage({
      search: "карданный вал",
      categorySlug: "transmissiya-i-mosty",
      availability: "on_request",
      priceStatus: "fixed",
      sort: "price_desc",
      page: 2,
      pageSize: 24,
    });

    const [path] = envelopeRequestMock.mock.calls[0];
    const url = new URL(path, "https://cms.example.test");
    expect(url.searchParams.get("filter[status][_eq]")).toBe("published");
    expect(url.searchParams.get("filter[category][slug][_eq]")).toBe(
      "transmissiya-i-mosty",
    );
    expect(url.searchParams.get("filter[availability_status][_eq]")).toBe(
      "on_request",
    );
    expect(url.searchParams.get("filter[price_status][_eq]")).toBe("fixed");
    expect(url.searchParams.get("search")).toBe("карданный вал");
    expect(url.searchParams.get("sort")).toBe("-price,title");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("limit")).toBe("24");
    expect(result.total).toBe(49);
  });

  it("prioritizes manually curated products for the default catalog order", async () => {
    envelopeRequestMock.mockResolvedValue({
      data: [],
      meta: { filter_count: 0 },
    });

    await getCatalogPage({
      search: "",
      page: 1,
      pageSize: 24,
      sort: "relevance",
    });

    const [path] = envelopeRequestMock.mock.calls[0];
    const url = new URL(path, "https://cms.example.test");
    expect(url.searchParams.get("sort")).toBe(
      "sort_order,-popularity_score,title",
    );
  });

  it("matches SKUs with hyphens or spaces through a published-only SKU index", async () => {
    envelopeRequestMock.mockResolvedValue({ data: [], meta: { filter_count: 0 } });
    requestMock.mockResolvedValue([]);

    await getCatalogPage({
      search: "re-57 934",
      page: 1,
      pageSize: 24,
      sort: "relevance",
    });

    const skuIndex = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    expect(skuIndex.searchParams.get("fields")).toBe("id,sku");
    expect(skuIndex.searchParams.get("filter[status][_eq]")).toBe("published");
  });

  it("loads only categories selected for the homepage", async () => {
    requestMock.mockResolvedValue([]);

    await getHomepageCategories();

    const url = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    expect(url.searchParams.get("filter[show_on_homepage][_eq]")).toBe("true");
  });

  it("loads featured homepage products with a bounded result size", async () => {
    requestMock.mockResolvedValue([
      {
        id: "complete",
        title: "Насос гидравлический",
        slug: "hydraulic-pump",
        sku: "RE504836",
        category: { id: "hydraulic", title: "Гидравлика", slug: "hydraulics" },
        short_description: null,
        main_image: "product-image",
        image_alt: "Насос",
        price: "125000",
        currency: "RUB",
        price_status: "fixed",
        availability_status: "in_stock",
        brand: "John Deere",
        part_type: "original",
        delivery_status: "На складе поставщика",
      },
      {
        id: "incomplete",
        title: "Без срока поставки",
        slug: "without-delivery",
        sku: "RE000000",
        category: null,
        short_description: null,
        main_image: "product-image",
        image_alt: null,
        price: "1200",
        currency: "RUB",
        price_status: "fixed",
        availability_status: "on_request",
        brand: null,
        part_type: null,
        delivery_status: "",
      },
    ]);

    const products = await getFeaturedProducts(2);

    const url = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    expect(url.searchParams.get("filter[is_featured][_eq]")).toBe("true");
    expect(url.searchParams.get("filter[price_status][_eq]")).toBeNull();
    expect(url.searchParams.get("filter[delivery_status][_nnull]")).toBeNull();
    expect(url.searchParams.get("fields")).toContain("delivery_status");
    expect(url.searchParams.get("limit")).toBe("6");
    expect(products.map(({ id }) => id)).toEqual(["complete", "incomplete"]);
  });

});

const rawProduct = (id: string) => ({
  id,
  title: `Товар ${id}`,
  slug: `product-${id}`,
  sku: `SKU-${id}`,
  category: null,
  short_description: null,
  main_image: null,
  image_alt: null,
  price: null,
  currency: "RUB",
  price_status: "on_request",
  availability_status: "on_request",
});

const suggestion = (id: string): ProductCardData => ({
  id,
  title: `Товар ${id}`,
  slug: `product-${id}`,
  sku: `SKU-${id}`,
  category: null,
  shortDescription: null,
  mainImageId: null,
  imageAlt: null,
  price: null,
  currency: "RUB",
  priceStatus: "on_request",
  availabilityStatus: "on_request",
  brand: null,
  mpn: null,
  gtin: null,
  partType: null,
  deliveryStatus: null,
});

describe("fetchProductSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes code-like queries through the indexed /deere-shop/search endpoint", async () => {
    requestMock
      .mockResolvedValueOnce([
        { id: "p2", slug: "product-p2", title: "Товар p2", sku: "SKU-P2", mpn: null, category: null },
        { id: "p1", slug: "product-p1", title: "Товар p1", sku: "SKU-P1", mpn: null, category: null },
      ])
      // Hydration returns the cards in the opposite order to prove the
      // endpoint ranking is preserved.
      .mockResolvedValueOnce([rawProduct("p1"), rawProduct("p2")]);

    const items = await fetchProductSuggestions(" re-504 836 ", 6);

    const endpointUrl = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    expect(endpointUrl.pathname).toBe("/deere-shop/search");
    expect(endpointUrl.searchParams.get("q")).toBe("RE504836");
    expect(endpointUrl.searchParams.get("limit")).toBe("6");

    const hydrationUrl = new URL(requestMock.mock.calls[1][0], "https://cms.test");
    expect(hydrationUrl.pathname).toBe("/items/products");
    expect(hydrationUrl.searchParams.get("filter[id][_in]")).toBe("p2,p1");

    expect(items).toEqual([suggestion("p2"), suggestion("p1")]);
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  it("skips hydration when the endpoint finds nothing", async () => {
    requestMock.mockResolvedValueOnce([]);

    await expect(fetchProductSuggestions("ZZ999999")).resolves.toEqual([]);

    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the legacy path when the endpoint is not installed (404)", async () => {
    requestMock
      .mockRejectedValueOnce(new DirectusRequestError(404, "/deere-shop/search"))
      .mockResolvedValueOnce([]) // legacy SKU index scan
      .mockResolvedValueOnce([]); // legacy products query

    await expect(fetchProductSuggestions("RE504836", 6)).resolves.toEqual([]);

    // The fallback reuses the legacy full-scan suggestion path untouched.
    const skuIndexUrl = new URL(requestMock.mock.calls[1][0], "https://cms.test");
    expect(skuIndexUrl.pathname).toBe("/items/products");
    expect(skuIndexUrl.searchParams.get("fields")).toBe("id,sku");
    expect(String(requestMock.mock.calls[2][0])).toContain("/items/products");
  });

  it("falls back to the legacy path on a network error", async () => {
    requestMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([rawProduct("p1")]);

    const items = await fetchProductSuggestions("RE504836", 6);

    expect(items).toEqual([suggestion("p1")]);
    expect(String(requestMock.mock.calls[0][0])).toContain("/deere-shop/search");
    expect(String(requestMock.mock.calls[1][0])).toContain("/items/products");
  });

  it("propagates endpoint errors other than 404/network", async () => {
    requestMock.mockRejectedValueOnce(
      new DirectusRequestError(500, "/deere-shop/search"),
    );

    await expect(fetchProductSuggestions("RE504836")).rejects.toBeInstanceOf(
      DirectusRequestError,
    );
  });

  it("keeps free-text queries on the legacy full-text search path", async () => {
    requestMock.mockResolvedValueOnce([]);

    await fetchProductSuggestions("насос гидравлический", 6);

    expect(requestMock).toHaveBeenCalledTimes(1);
    const url = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    expect(url.pathname).toBe("/items/products");
    expect(url.searchParams.get("search")).toBe("насос гидравлический");
  });

  it("keeps queries that normalize below two characters on the legacy path", async () => {
    requestMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await fetchProductSuggestions("a", 6);

    expect(String(requestMock.mock.calls[0][0])).not.toContain("/deere-shop/search");
    expect(String(requestMock.mock.calls[0][0])).toContain("/items/products");
  });
});
