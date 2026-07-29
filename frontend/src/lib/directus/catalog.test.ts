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

  it("loads only published categories", async () => {
    requestMock.mockResolvedValue([]);

    await getCategories();

    const [path] = requestMock.mock.calls[0];
    const url = new URL(path, "https://cms.example.test");
    expect(url.searchParams.get("filter[status][_eq]")).toBe("published");
    expect(url.searchParams.get("sort")).toBe("sort_order,title");
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

  it("loads only categories selected for the homepage", async () => {
    requestMock.mockResolvedValue([]);

    await getHomepageCategories();

    const url = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    expect(url.searchParams.get("filter[show_on_homepage][_eq]")).toBe("true");
  });

  it("loads featured homepage products with a bounded result size", async () => {
    requestMock.mockResolvedValue([]);

    await getFeaturedProducts(8);

    const url = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    expect(url.searchParams.get("filter[is_featured][_eq]")).toBe("true");
    expect(url.searchParams.get("limit")).toBe("8");
  });
});
