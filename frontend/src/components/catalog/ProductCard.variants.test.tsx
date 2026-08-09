import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ProductCardData } from "@/types/catalog";

import { ProductCard } from "./ProductCard";

const product: ProductCardData = {
  id: "product-variant",
  title: "Гидравлический фильтр",
  slug: "hydraulic-filter",
  sku: "RE123456",
  category: { id: "filters", title: "Фильтры", slug: "filters" },
  shortDescription: "Описание товара для каталога.",
  mainImageId: "file-1",
  imageAlt: "Гидравлический фильтр",
  price: null,
  currency: "RUB",
  priceStatus: "on_request",
  availabilityStatus: "on_request",
};

describe("ProductCard variants", () => {
  it("uses a compact homepage variant without the description", () => {
    const { container } = render(
      <ProductCard product={product} variant="homepage" />,
    );

    expect(container.querySelector(".product-card--homepage")).toBeTruthy();
    expect(screen.queryByText(product.shortDescription!)).not.toBeInTheDocument();
    const image = screen.getByRole("img", { name: product.imageAlt! });
    const src = decodeURIComponent(image.getAttribute("src") ?? "");
    expect(src).toContain("width=720");
    expect(src).toContain("height=450");
    expect(src).toContain("fit=cover");
  });

  it("keeps the description in the catalog variant", () => {
    render(<ProductCard product={product} variant="catalog" />);
    expect(screen.getByText(product.shortDescription!)).toBeInTheDocument();
  });
});
