import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Product } from "@/types/catalog";

vi.mock("./AddToCartButton", () => ({ AddToCartButton: () => null }));
vi.mock("./ProductGallery", () => ({ ProductGallery: () => null }));
vi.mock("./ProductVerification", () => ({ ProductVerification: () => null }));

import { ProductDetail } from "./ProductDetail";

const product: Product = {
  id: "product-42",
  title: "Фильтр",
  slug: "filtr",
  sku: "RE504836",
  category: { id: "category-1", title: "Фильтры", slug: "filtry" },
  shortDescription: null,
  mainImageId: null,
  imageAlt: null,
  price: null,
  currency: "RUB",
  priceStatus: "on_request",
  availabilityStatus: "on_request",
  fullDescription: null,
  seoText: null,
  galleryIds: [],
  specifications: [],
  documentIds: [],
  seoTitle: null,
  seoDescription: null,
  ogImageId: null,
  relatedProductIds: [],
  ctaText: null,
};

describe("ProductDetail", () => {
  it("links the consultation CTA to the local inline form anchor", () => {
    render(<ProductDetail documents={[]} product={product} />);

    expect(screen.getByRole("link", { name: "Запросить консультацию" })).toHaveAttribute(
      "href",
      "#consultation",
    );
  });
});
