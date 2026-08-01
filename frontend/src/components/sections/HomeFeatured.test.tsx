import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ProductCardData } from "@/types/catalog";
import type { PageSection } from "@/types/content";

import { HomeFeatured } from "./HomeFeatured";

const section: PageSection = {
  id: "featured",
  type: "featured_products",
  title: null,
  subtitle: null,
  text: null,
  imageId: null,
  buttonText: null,
  buttonUrl: null,
  items: [],
  settings: {},
  sortOrder: 1,
};

const completeProduct = {
  id: "product-1",
  title: "Насос гидравлический",
  slug: "pump",
  sku: "RE504836",
  category: { id: "hydraulic", title: "Гидравлика", slug: "hydraulics" },
  shortDescription: null,
  mainImageId: "image-1",
  imageAlt: "Насос",
  price: 125000,
  currency: "RUB",
  priceStatus: "fixed",
  availabilityStatus: "in_stock",
  brand: null,
  partType: null,
  deliveryStatus: "На складе поставщика",
} as ProductCardData;

describe("HomeFeatured", () => {
  it("uses the catalog fallback heading and excludes incomplete products", () => {
    render(
      <HomeFeatured
        products={[
          completeProduct,
          { ...completeProduct, id: "missing-delivery", deliveryStatus: null },
        ]}
        section={section}
      />,
    );

    expect(screen.getByRole("heading", { name: "Позиции каталога" })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });

  it("hides the block when every featured product is incomplete", () => {
    const { container } = render(
      <HomeFeatured
        products={[{ ...completeProduct, mainImageId: null }]}
        section={section}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
