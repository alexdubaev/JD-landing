import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductCardData } from "@/types/catalog";

import {
  DirectusRequestError,
  directusEnvelopeRequest,
  directusRequest,
} from "./client";
import {
  fetchProductAnalogs,
  fetchProductSuggestions,
  getCatalogPage,
  getCatalogSuggestions,
  getCategories,
  getCategoryRedirect,
  getCategorySitemapEntries,
  getFeaturedProducts,
  getFilesByIds,
  getHomepageCategories,
  getPageSeoBySlug,
  getProductBySlugs,
  getProductSitemapEntries,
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
        sort_order: 4,
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
      sortOrder: 4,
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

  it("normalizes the search cache key for casing and whitespace variants", async () => {
    envelopeRequestMock.mockResolvedValue({ data: [], meta: { filter_count: 0 } });

    await getCatalogPage({
      search: " Карданный Вал ",
      page: 1,
      pageSize: 24,
      sort: "relevance",
    });
    await getCatalogPage({
      search: "КАРДАННЫЙ ВАЛ",
      page: 1,
      pageSize: 24,
      sort: "relevance",
    });

    const first = new URL(envelopeRequestMock.mock.calls[0][0], "https://cms.test");
    const second = new URL(envelopeRequestMock.mock.calls[1][0], "https://cms.test");
    expect(first.searchParams.get("search")).toBe("карданный вал");
    // Identical query strings mean identical fetch cache keys.
    expect(first.searchParams.toString()).toBe(second.searchParams.toString());
  });

  it("caps the sku match list hydrated into suggestions", async () => {
    const index = Array.from({ length: 30 }, (_, i) => ({
      id: `id-${i}`,
      sku: `RE50${i}`,
    }));
    requestMock
      .mockResolvedValueOnce(index) // sku index
      .mockResolvedValueOnce([]); // hydrated product cards

    await getCatalogSuggestions("re50", 6);

    const productsUrl = new URL(requestMock.mock.calls[1][0], "https://cms.test");
    const inFilter = productsUrl.searchParams.get("filter[id][_in]") ?? "";
    expect(inFilter.split(",")).toHaveLength(20);
    expect(inFilter.split(",")[0]).toBe("id-0");
  });

  it("caps the sku match filter on catalog pages to keep the URL bounded", async () => {
    const index = Array.from({ length: 150 }, (_, i) => ({
      id: `id-${i}`,
      sku: `RE50${String(i).padStart(3, "0")}`,
    }));
    requestMock.mockResolvedValueOnce(index);
    envelopeRequestMock.mockResolvedValue({ data: [], meta: { filter_count: 100 } });

    await getCatalogPage({
      search: "re5",
      page: 1,
      pageSize: 24,
      sort: "relevance",
    });

    const url = new URL(envelopeRequestMock.mock.calls[0][0], "https://cms.test");
    const inFilter = url.searchParams.get("filter[id][_in]") ?? "";
    expect(inFilter.split(",")).toHaveLength(100);
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

const rawDetailProduct = (overrides: Record<string, unknown> = {}) => ({
  id: "product-1",
  title: "Насос гидравлический",
  slug: "hydraulic-pump",
  sku: "RE654321",
  category: { id: "category-1", title: "Гидравлика", slug: "hydraulics" },
  short_description: null,
  full_description: null,
  seo_text: null,
  main_image: null,
  gallery: ["legacy-gallery-1", "legacy-gallery-2"],
  specifications: [{ name: "Масса", value: "12 кг" }],
  documents: ["legacy-doc-1"],
  price: null,
  currency: "RUB",
  price_status: "on_request",
  availability_status: "on_request",
  image_alt: "Насос",
  seo_title: null,
  seo_description: null,
  og_image: null,
  seo: null,
  seo_quality_status: null,
  is_indexable: true,
  related_products: [],
  cta_text: null,
  ...overrides,
});

/**
 * Mocks the four requests of the R7A dual-read: the product detail query plus
 * the three bounded child-collection reads (product_images,
 * product_specifications, product_documents).
 */
const dualReadMock = ({
  detail = [rawDetailProduct()],
  images = [],
  specifications = [],
  documents = [],
  rejectImages = false,
}: {
  detail?: unknown[];
  images?: { image: string | null; alt_text: string | null; sort_order?: number }[];
  specifications?: {
    group_name: string | null;
    name: string | null;
    value: string | null;
    unit: string | null;
    sort_order?: number;
  }[];
  documents?: { file: string | null; title: string | null; sort_order?: number }[];
  rejectImages?: boolean;
} = {}) =>
  requestMock.mockImplementation(async (path: string) => {
    if (path.startsWith("/items/products?")) return detail;
    if (path.startsWith("/items/product_images?")) {
      if (rejectImages) {
        throw new DirectusRequestError(403, "/items/product_images");
      }
      return images;
    }
    if (path.startsWith("/items/product_specifications?")) return specifications;
    if (path.startsWith("/items/product_documents?")) return documents;
    throw new Error(`unexpected request ${path}`);
  });

describe("product media dual-read (R7A)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders canonical child rows when the child collections are filled", async () => {
    dualReadMock({
      images: [
        { image: "child-image-1", alt_text: "Насос в разрезе", sort_order: 1 },
        { image: "child-image-2", alt_text: null, sort_order: 2 },
      ],
      specifications: [
        {
          group_name: "Габариты",
          name: "Масса",
          value: "12",
          unit: "кг",
          sort_order: 1,
        },
      ],
      documents: [{ file: "child-doc-1", title: "Паспорт насоса", sort_order: 1 }],
    });

    const product = await getProductBySlugs("hydraulics", "hydraulic-pump");

    expect(product?.images).toEqual([
      { imageId: "child-image-1", alt: "Насос в разрезе" },
      { imageId: "child-image-2", alt: null },
    ]);
    expect(product?.specificationItems).toEqual([
      { name: "Масса", value: "12", unit: "кг", group: "Габариты" },
    ]);
    expect(product?.documentItems).toEqual([
      { fileId: "child-doc-1", title: "Паспорт насоса" },
    ]);
    expect(product?.mediaSources).toEqual({
      images: "children",
      specifications: "children",
      documents: "children",
    });
    // The winning side is mirrored into the legacy field names so pages that
    // still read them (documents fetch, SpecTable) render child data.
    expect(product?.galleryIds).toEqual(["child-image-1", "child-image-2"]);
    expect(product?.documentIds).toEqual(["child-doc-1"]);

    const childUrls = requestMock.mock.calls
      .map(([path]) => new URL(String(path), "https://cms.test"))
      .filter((url) => url.pathname.startsWith("/items/product_"));
    expect(childUrls).toHaveLength(3);
    for (const url of childUrls) {
      expect(url.searchParams.get("filter[product][_eq]")).toBe("product-1");
      expect(url.searchParams.get("limit")).toBe("100");
      expect(url.searchParams.get("limit")).not.toBe("-1");
      expect(url.searchParams.get("sort")).toBe("sort_order,id");
    }
  });

  it("never shadows non-empty legacy values with an empty child list", async () => {
    dualReadMock();

    const product = await getProductBySlugs("hydraulics", "hydraulic-pump");

    expect(product?.images).toEqual([
      { imageId: "legacy-gallery-1", alt: null },
      { imageId: "legacy-gallery-2", alt: null },
    ]);
    expect(product?.specificationItems).toEqual([
      { name: "Масса", value: "12 кг", unit: null, group: null },
    ]);
    expect(product?.documentItems).toEqual([{ fileId: "legacy-doc-1", title: null }]);
    expect(product?.mediaSources).toEqual({
      images: "legacy",
      specifications: "legacy",
      documents: "legacy",
    });
    expect(product?.galleryIds).toEqual(["legacy-gallery-1", "legacy-gallery-2"]);
    expect(product?.specifications).toEqual([
      { name: "Масса", value: "12 кг", unit: null, group: null },
    ]);
    expect(product?.documentIds).toEqual(["legacy-doc-1"]);
  });

  it("returns empty normalized views when both sides are empty", async () => {
    dualReadMock({
      detail: [
        rawDetailProduct({
          gallery: [],
          specifications: [],
          documents: [],
        }),
      ],
    });

    const product = await getProductBySlugs("hydraulics", "hydraulic-pump");

    expect(product?.images).toEqual([]);
    expect(product?.specificationItems).toEqual([]);
    expect(product?.documentItems).toEqual([]);
    expect(product?.mediaSources).toEqual({
      images: "legacy",
      specifications: "legacy",
      documents: "legacy",
    });
  });

  it("degrades unreadable child collections to the legacy fallback", async () => {
    dualReadMock({
      rejectImages: true,
      specifications: [
        { group_name: null, name: "Масса", value: "12", unit: "кг", sort_order: 1 },
      ],
    });

    const product = await getProductBySlugs("hydraulics", "hydraulic-pump");

    // The failed product_images read falls back to legacy gallery refs; the
    // readable child collections still win independently.
    expect(product?.images).toEqual([
      { imageId: "legacy-gallery-1", alt: null },
      { imageId: "legacy-gallery-2", alt: null },
    ]);
    expect(product?.specificationItems).toEqual([
      { name: "Масса", value: "12", unit: "кг", group: null },
    ]);
    expect(product?.mediaSources).toEqual({
      images: "legacy",
      specifications: "children",
      documents: "legacy",
    });
  });
});

const rawCategory = (overrides: Record<string, unknown> = {}) => ({
  id: "engine",
  title: "Двигатель",
  slug: "engine",
  sort_order: 0,
  parent: null,
  description: null,
  image: null,
  image_alt: null,
  icon: null,
  icon_alt: null,
  h1: null,
  seo_title: null,
  seo_description: null,
  seo_text: null,
  intro: null,
  selection_guide: null,
  internal_links: null,
  og_image: null,
  is_indexable: true,
  redirect_target: null,
  seo: null,
  ...overrides,
});

describe("SEO dual-read (R11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps a scalar-only product exactly as before the dual-read (seo null)", async () => {
    dualReadMock({
      detail: [
        rawDetailProduct({
          seo_title: "Насос — скалярный заголовок",
          seo_description: "Скалярное описание",
          og_image: "scalar-og-file",
          is_indexable: false,
        }),
      ],
    });
    const product = await getProductBySlugs("hydraulics", "hydraulic-pump");

    // The R11 production-safety property: with seo = null the mapped SEO
    // output is byte-identical to the pre-dual-read scalar mapping.
    expect(product).toEqual(
      expect.objectContaining({
        seoTitle: "Насос — скалярный заголовок",
        seoDescription: "Скалярное описание",
        ogImageId: "scalar-og-file",
        isIndexable: false,
        seo: null,
      }),
    );

    // The detail query now also requests the additive seo field.
    const detailUrl = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    expect(detailUrl.searchParams.get("fields")).toContain("seo");
  });

  it("lets the plugin JSON win over conflicting product scalars", async () => {
    dualReadMock({
      detail: [
        rawDetailProduct({
          seo_title: "Скалярный заголовок",
          seo_description: "Скалярное описание",
          og_image: "scalar-og-file",
          is_indexable: true,
          seo: {
            title: "JSON-заголовок",
            meta_description: "JSON-описание",
            og_image: "json-og-file",
            no_index: true,
          },
        }),
      ],
    });
    const product = await getProductBySlugs("hydraulics", "hydraulic-pump");

    expect(product).toEqual(
      expect.objectContaining({
        seoTitle: "JSON-заголовок",
        seoDescription: "JSON-описание",
        ogImageId: "json-og-file",
        isIndexable: false,
        seo: {
          title: "JSON-заголовок",
          meta_description: "JSON-описание",
          og_image: "json-og-file",
          no_index: true,
        },
      }),
    );
  });

  it("merges a partial product JSON per key (missing no_index falls back to the scalar)", async () => {
    dualReadMock({
      detail: [
        rawDetailProduct({
          seo_title: "Скалярный заголовок",
          seo_description: null,
          is_indexable: false,
          seo: { title: "JSON-заголовок" },
        }),
      ],
    });
    const product = await getProductBySlugs("hydraulics", "hydraulic-pump");

    expect(product).toEqual(
      expect.objectContaining({
        seoTitle: "JSON-заголовок",
        seoDescription: null,
        isIndexable: false,
      }),
    );
  });

  it("maps a scalar-only category exactly as before and requests the seo field", async () => {
    requestMock.mockResolvedValue([
      rawCategory({
        seo_title: "Двигатель — запчасти",
        seo_description: "Скалярное описание",
        og_image: "scalar-cat-og",
        is_indexable: false,
      }),
    ]);
    const categories = await getCategories();

    expect(categories[0]).toEqual(
      expect.objectContaining({
        seoTitle: "Двигатель — запчасти",
        seoDescription: "Скалярное описание",
        ogImageId: "scalar-cat-og",
        isIndexable: false,
        seo: null,
      }),
    );
    const url = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    expect(url.searchParams.get("fields")).toContain("seo");
  });

  it("lets the plugin JSON win for categories and degrades corrupted JSON", async () => {
    requestMock
      .mockResolvedValueOnce([
        rawCategory({
          seo_title: "Скалярный заголовок",
          seo: { title: "JSON-категория", no_index: true },
        }),
      ])
      .mockResolvedValueOnce([
        rawCategory({
          id: "engine-2",
          slug: "engine-2",
          seo_title: "Скалярный заголовок",
          seo: "garbage",
        }),
      ]);
    const [jsonCategory] = await getCategories();
    const [corrupted] = await getCategories();

    expect(jsonCategory).toEqual(
      expect.objectContaining({
        seoTitle: "JSON-категория",
        isIndexable: false,
        seo: { title: "JSON-категория", no_index: true },
      }),
    );
    expect(corrupted).toEqual(
      expect.objectContaining({
        seoTitle: "Скалярный заголовок",
        isIndexable: true,
        seo: null,
      }),
    );
  });

  it("maps a scalar-only page exactly as before (getPageSeoBySlug)", async () => {
    requestMock.mockResolvedValue([
      {
        title: "Доставка",
        h1: "Доставка",
        eyebrow: null,
        intro: null,
        seo_title: "Доставка — скалярный заголовок",
        seo_description: "Скалярное описание",
        og_image: "scalar-page-og",
        canonical_url: "https://deere-shop.test/delivery",
        is_indexable: true,
        seo: null,
      },
    ]);
    const pageSeo = await getPageSeoBySlug("delivery");

    expect(pageSeo).toEqual(
      expect.objectContaining({
        seoTitle: "Доставка — скалярный заголовок",
        seoDescription: "Скалярное описание",
        ogImageId: "scalar-page-og",
        canonicalUrl: "https://deere-shop.test/delivery",
        isIndexable: true,
        seo: null,
      }),
    );
    const url = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    expect(url.searchParams.get("fields")).toContain("seo");
  });

  it("lets the plugin JSON win for page SEO including canonical and no_index", async () => {
    requestMock.mockResolvedValue([
      {
        title: "Доставка",
        h1: "Доставка",
        eyebrow: null,
        intro: null,
        seo_title: "Скалярный заголовок",
        seo_description: "Скалярное описание",
        og_image: "scalar-page-og",
        canonical_url: "https://deere-shop.test/scalar",
        is_indexable: true,
        seo: {
          title: "JSON-заголовок",
          meta_description: "JSON-описание",
          og_image: "json-page-og",
          additional_fields: { canonical_url: "https://deere-shop.test/json" },
          no_index: true,
        },
      },
    ]);
    const pageSeo = await getPageSeoBySlug("delivery");

    expect(pageSeo).toEqual(
      expect.objectContaining({
        seoTitle: "JSON-заголовок",
        seoDescription: "JSON-описание",
        ogImageId: "json-page-og",
        canonicalUrl: "https://deere-shop.test/json",
        isIndexable: false,
      }),
    );
  });

  it("an empty-object page JSON keeps the scalar indexability per key", async () => {
    requestMock.mockResolvedValue([
      {
        title: "Доставка",
        h1: "Доставка",
        eyebrow: null,
        intro: null,
        seo_title: null,
        seo_description: null,
        og_image: null,
        canonical_url: null,
        is_indexable: false,
        seo: {},
      },
    ]);
    const pageSeo = await getPageSeoBySlug("delivery");

    // JSON is present (so it drives indexability) but no_index is missing —
    // the scalar is_indexable=false falls back per key.
    expect(pageSeo?.isIndexable).toBe(false);
    expect(pageSeo?.seo).toEqual({});
  });
});

const analogRow = (
  from: string,
  to: string,
  relation_type: string,
  overrides: Record<string, unknown> = {},
) => ({
  id: `row-${from}-${to}-${relation_type}`,
  product_from: from,
  product_to: to,
  relation_type,
  source_name: null,
  note: null,
  verified_at: null,
  ...overrides,
});

/**
 * Mocks the two requests of the R8 analog dual-read: the bounded
 * products_analogs edge query plus the published-product hydration.
 */
const analogsMock = ({
  rows = [],
  products = [],
  rejectRows = false,
}: {
  rows?: ReturnType<typeof analogRow>[];
  products?: ReturnType<typeof rawProduct>[] | unknown[];
  rejectRows?: boolean;
} = {}) =>
  requestMock.mockImplementation(async (path: string) => {
    if (path.startsWith("/items/products_analogs?")) {
      if (rejectRows) {
        throw new DirectusRequestError(403, "/items/products_analogs");
      }
      return rows;
    }
    if (path.startsWith("/items/products?")) {
      const url = new URL(path, "https://cms.test");
      const ids = (url.searchParams.get("filter[id][_in]") ?? "")
        .split(",")
        .filter(Boolean);
      return (products as { id: string }[]).filter((product) =>
        ids.includes(product.id),
      );
    }
    throw new Error(`unexpected request ${path}`);
  });

describe("fetchProductAnalogs (R8 dual-read)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries both junction sides with a bounded limit", async () => {
    analogsMock({ rows: [], products: [] });

    await fetchProductAnalogs("product-1");

    const edgesUrl = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    expect(edgesUrl.pathname).toBe("/items/products_analogs");
    expect(edgesUrl.searchParams.get("filter[_or][0][product_from][_eq]")).toBe(
      "product-1",
    );
    expect(edgesUrl.searchParams.get("filter[_or][1][product_to][_eq]")).toBe(
      "product-1",
    );
    expect(edgesUrl.searchParams.get("limit")).toBe("100");
    expect(edgesUrl.searchParams.get("limit")).not.toBe("-1");

    // An empty edge list skips the hydration request entirely.
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("maps symmetric edges from both directions and keeps only outgoing supersession", async () => {
    analogsMock({
      rows: [
        analogRow("product-1", "p2", "analog"), // current product = from side
        analogRow("p3", "product-1", "oem_cross"), // current product = to side
        analogRow("product-1", "p4", "superseded_by"), // outgoing — rendered
        analogRow("p5", "product-1", "superseded_by"), // incoming — never rendered
        analogRow("product-1", "p6", "cross_sell"), // unknown type — dropped
      ],
      products: [rawProduct("p2"), rawProduct("p3"), rawProduct("p4")],
    });

    const view = await fetchProductAnalogs("product-1");

    expect(view.analogs.map(({ relationType, direction, product }) => ({
      relationType,
      direction,
      id: product.id,
    }))).toEqual([
      { relationType: "analog", direction: "from", id: "p2" },
      { relationType: "oem_cross", direction: "to", id: "p3" },
    ]);
    expect(view.supersededBy.map(({ direction, product }) => ({
      direction,
      id: product.id,
    }))).toEqual([{ direction: "from", id: "p4" }]);
  });

  it("drops edges whose other side fails to hydrate (unpublished or deleted)", async () => {
    analogsMock({
      rows: [analogRow("product-1", "p2", "analog"), analogRow("product-1", "p9", "analog")],
      products: [rawProduct("p2")], // p9 stays unpublished -> no card
    });

    const view = await fetchProductAnalogs("product-1");

    expect(view.analogs.map(({ product }) => product.id)).toEqual(["p2"]);
  });

  it("carries edge provenance into the mapped items", async () => {
    analogsMock({
      rows: [
        analogRow("product-1", "p2", "analog", {
          source_name: "jd-catalog-2026",
          note: "Полный аналог по посадке",
          verified_at: "2026-08-01T00:00:00Z",
        }),
      ],
      products: [rawProduct("p2")],
    });

    const view = await fetchProductAnalogs("product-1");

    expect(view.analogs[0]).toMatchObject({
      sourceName: "jd-catalog-2026",
      note: "Полный аналог по посадке",
      verifiedAt: "2026-08-01T00:00:00Z",
    });
  });

  it("degrades an unreadable junction to the empty view so legacy fallback still renders", async () => {
    analogsMock({ rejectRows: true });

    const view = await fetchProductAnalogs("product-1");

    expect(view).toEqual({ analogs: [], supersededBy: [] });
  });
});

describe("getCategoryRedirect", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the trimmed redirect target for an archived category", async () => {
    requestMock.mockResolvedValue([
      { status: "archived", redirect_target: " new-slug " },
    ]);

    await expect(getCategoryRedirect("old-slug")).resolves.toBe("new-slug");

    const url = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    expect(url.searchParams.get("filter[slug][_eq]")).toBe("old-slug");
    expect(url.searchParams.get("filter[redirect_target][_null]")).toBe("false");
    expect(url.searchParams.get("fields")).toBe("status,redirect_target");
    expect(url.searchParams.get("limit")).toBe("1");
  });

  it("returns null for a published category, a missing row or a blank target", async () => {
    requestMock.mockResolvedValueOnce([
      { status: "published", redirect_target: "somewhere" },
    ]);
    await expect(getCategoryRedirect("live")).resolves.toBeNull();

    requestMock.mockResolvedValueOnce([]);
    await expect(getCategoryRedirect("ghost")).resolves.toBeNull();

    requestMock.mockResolvedValueOnce([
      { status: "archived", redirect_target: "   " },
    ]);
    await expect(getCategoryRedirect("blank")).resolves.toBeNull();
  });
});

describe("getFilesByIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DIRECTUS_URL", "https://cms.example.test");
    vi.stubEnv("DIRECTUS_TOKEN", "server-token-for-tests-only");
    vi.stubEnv(
      "DIRECTUS_PUBLIC_FOLDER_ID",
      "1ecf70c5-0ad4-4e5e-8d73-78ee549f064a",
    );
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("skips the request entirely for an empty id list", async () => {
    expect(await getFilesByIds([])).toEqual([]);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("returns public-folder documents mapped for the download UI", async () => {
    requestMock.mockResolvedValue([
      {
        id: "file-1",
        filename_download: "pasport.pdf",
        title: "Паспорт",
        type: "application/pdf",
      },
    ]);

    const files = await getFilesByIds(["file-1", "file-1", ""]);

    expect(files).toEqual([
      {
        id: "file-1",
        filename: "pasport.pdf",
        title: "Паспорт",
        type: "application/pdf",
      },
    ]);
    const url = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    expect(url.searchParams.get("filter[id][_in]")).toBe("file-1");
    expect(url.searchParams.get("filter[folder][_eq]")).toBe(
      "1ecf70c5-0ad4-4e5e-8d73-78ee549f064a",
    );
  });
});

describe("sitemap entries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists only indexable published products with a category", async () => {
    requestMock.mockResolvedValue([
      {
        slug: "nasos",
        updated_at: "2026-08-10T10:00:00Z",
        category: { slug: "nasosy" },
      },
      { slug: "orphan", updated_at: "2026-08-10T10:00:00Z", category: null },
    ]);

    const entries = await getProductSitemapEntries();

    const url = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    expect(url.searchParams.get("filter[status][_eq]")).toBe("published");
    expect(url.searchParams.get("filter[is_indexable][_neq]")).toBe("false");
    expect(url.searchParams.get("limit")).toBe("-1");
    expect(entries).toEqual([
      {
        categorySlug: "nasosy",
        productSlug: "nasos",
        updatedAt: "2026-08-10T10:00:00Z",
      },
    ]);
  });

  it("lists category slugs with their lastmod timestamps", async () => {
    requestMock.mockResolvedValue([
      { slug: "gidravlika", updated_at: "2026-08-01T00:00:00Z" },
    ]);

    const entries = await getCategorySitemapEntries();

    const url = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    expect(url.pathname).toBe("/items/categories");
    expect(url.searchParams.get("filter[is_indexable][_neq]")).toBe("false");
    expect(entries).toEqual([
      { slug: "gidravlika", updatedAt: "2026-08-01T00:00:00Z" },
    ]);
  });
});

describe("catalog page count fallback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("falls back to the page length when filter_count meta is missing", async () => {
    envelopeRequestMock.mockResolvedValue({
      data: [rawProduct("p1"), rawProduct("p2")],
    });

    const result = await getCatalogPage({ search: "", sort: "relevance", page: 1, pageSize: 24 });

    expect(result.total).toBe(2);
  });
});
