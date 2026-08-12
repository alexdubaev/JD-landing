import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  directusEnvelopeRequest,
  directusRequest,
} from "./client";
import {
  getCatalogPage,
  getCategories,
  getFeaturedProducts,
  getHomepageCategories,
} from "./catalog";

vi.mock("./client", () => ({
  directusRequest: vi.fn(),
  directusEnvelopeRequest: vi.fn(),
}));

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
