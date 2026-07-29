import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ProductCardData } from "@/types/catalog";

import { ProductCard } from "./ProductCard";

const product: ProductCardData = {
  id: "product-1",
  title: "Фильтр гидравлический",
  slug: "hydraulic-filter",
  sku: "RE123456",
  category: {
    id: "category-1",
    title: "Фильтры",
    slug: "filters",
  },
  shortDescription: "Запасная часть для обслуживания техники.",
  mainImageId: "file-1",
  imageAlt: "Гидравлический фильтр",
  price: 125000,
  currency: "RUB",
  priceStatus: "fixed",
  availabilityStatus: "in_stock",
};

describe("ProductCard", () => {
  it("renders a fixed price, SKU, image, and catalog links", () => {
    render(<ProductCard product={product} />);

    expect(screen.getByText(/125\s*000/)).toBeInTheDocument();
    expect(screen.getByText(/RE123456/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Гидравлический фильтр" })).toHaveAttribute(
      "src",
      expect.stringContaining("file-1"),
    );
    expect(screen.getByRole("link", { name: "Фильтры" })).toHaveAttribute(
      "href",
      "/catalog/filters",
    );
    expect(
      screen.getByRole("link", { name: "Фильтр гидравлический" }),
    ).toHaveAttribute("href", "/catalog/filters/hydraulic-filter");
    expect(
      screen.getByTestId("product-card-action-arrow"),
    ).toHaveAttribute("aria-hidden", "true");
  });

  it("renders request pricing and a safe missing-image fallback", () => {
    render(
      <ProductCard
        product={{
          ...product,
          mainImageId: null,
          imageAlt: null,
          price: null,
          priceStatus: "on_request",
        }}
      />,
    );

    expect(screen.getByText("Цена по запросу")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Изображение товара пока не добавлено" }),
    ).toBeInTheDocument();
  });

  it("does not invent a price when it is hidden", () => {
    render(
      <ProductCard
        product={{
          ...product,
          price: null,
          priceStatus: "hidden",
        }}
      />,
    );

    expect(screen.getByText("Уточнить условия")).toBeInTheDocument();
    expect(screen.queryByText(/₽/)).not.toBeInTheDocument();
  });
});
