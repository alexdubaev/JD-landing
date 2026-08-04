import { describe, expect, it } from "vitest";

import type { Product } from "@/types/catalog";

import {
  buildCollectionPageSchema,
  buildFaqSchema,
  buildProductSchema,
} from "./schema";

const baseProduct: Product = {
  id: "p1",
  title: "Фильтр John Deere RE509672",
  slug: "filter-re509672",
  sku: "RE509672",
  category: { id: "filters", title: "Фильтры", slug: "filters" },
  shortDescription: "Топливный фильтр для двигателя John Deere.",
  mainImageId: "img-1",
  imageAlt: "Топливный фильтр RE509672 в упаковке",
  price: null,
  currency: "RUB",
  priceStatus: "on_request",
  availabilityStatus: "in_stock",
  fullDescription: null,
  seoText: null,
  galleryIds: [],
  specifications: [],
  documentIds: [],
  seoTitle: null,
  seoDescription: null,
  ogImageId: null,
  isIndexable: true,
  relatedProductIds: [],
  ctaText: null,
};

describe("buildProductSchema", () => {
  it("includes sku, brand, category and image, and omits offers without a visible price", () => {
    const schema = buildProductSchema({
      product: { ...baseProduct, brand: "John Deere", mpn: "RE509672" },
      categorySlug: "filters",
    });

    expect(schema["@type"]).toBe("Product");
    expect(schema.sku).toBe("RE509672");
    expect(schema.name).toBe("Фильтр John Deere RE509672");
    expect(schema.brand).toEqual({ "@type": "Brand", name: "John Deere" });
    expect(schema.category).toBe("Фильтры");
    expect(schema.image).toBeTruthy();
    // Price is on_request → no Offer should be emitted.
    expect(schema.offers).toBeUndefined();
  });

  it("emits mpn and gtin when the CMS provides them", () => {
    const schema = buildProductSchema({
      product: {
        ...baseProduct,
        mpn: "RE509672",
        gtin: "07123456789012",
      },
      categorySlug: "filters",
    });

    expect(schema.mpn).toBe("RE509672");
    expect(schema.gtin).toBe("07123456789012");
  });

  it("omits mpn/gtin when they are absent", () => {
    const schema = buildProductSchema({
      product: baseProduct,
      categorySlug: "filters",
    });

    expect(schema.mpn).toBeUndefined();
    expect(schema.gtin).toBeUndefined();
  });

  it("emits an Offer with seller anchored to the Organization @id when a price is fixed", () => {
    const schema = buildProductSchema({
      product: {
        ...baseProduct,
        price: 4500,
        priceStatus: "fixed",
        availabilityStatus: "in_stock",
      },
      categorySlug: "filters",
    });

    const offers = schema.offers as Record<string, unknown>;
    expect(offers["@type"]).toBe("Offer");
    expect(offers.price).toBe(4500);
    expect(offers.priceCurrency).toBe("RUB");
    expect(offers.availability).toBe("https://schema.org/InStock");
    // Seller must reference the Organization @id defined on the site.
    expect(offers.seller).toEqual({ "@id": expect.stringMatching(/#organization$/) });
  });
});

describe("buildFaqSchema", () => {
  it("returns null for an empty list so callers can skip emitting it", () => {
    expect(buildFaqSchema([])).toBeNull();
  });

  it("builds a FAQPage with one Question per item", () => {
    const schema = buildFaqSchema([
      { id: "q1", question: "Подойдёт ли этот фильтр?", answer: "Да." },
      { id: "q2", question: "Срок поставки?", answer: "3–5 дней." },
    ]);

    expect(schema).toEqual(
      expect.objectContaining({
        "@type": "FAQPage",
        mainEntity: [
          expect.objectContaining({ "@type": "Question", name: "Подойдёт ли этот фильтр?" }),
          expect.objectContaining({ "@type": "Question", name: "Срок поставки?" }),
        ],
      }),
    );
  });
});

describe("buildCollectionPageSchema", () => {
  it("ties the page to the WebSite via isPartOf", () => {
    const schema = buildCollectionPageSchema({
      name: "Фильтры",
      url: "https://deere-shop.ru/catalog/filters",
      description: "Подбор фильтров для техники John Deere.",
    });

    expect(schema["@type"]).toBe("CollectionPage");
    expect(schema.name).toBe("Фильтры");
    expect(schema.isPartOf).toEqual(
      expect.objectContaining({ "@type": "WebSite" }),
    );
  });

  it("omits description when none is provided", () => {
    const schema = buildCollectionPageSchema({
      name: "Каталог",
      url: "https://deere-shop.ru/catalog",
    });

    expect(schema.description).toBeUndefined();
  });
});
