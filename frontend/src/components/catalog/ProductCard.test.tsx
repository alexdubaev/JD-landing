import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ProductCardData } from "@/types/catalog";

import { ProductCard } from "./ProductCard";

const product = {
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
  brand: "John Deere",
  partType: "original",
  deliveryStatus: "На складе поставщика",
} as ProductCardData;

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
    expect(screen.getByText("John Deere")).toBeInTheDocument();
    expect(screen.getByText("Оригинал")).toBeInTheDocument();
    expect(screen.getByText("На складе поставщика")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Подробнее" })).toHaveAttribute(
      "href",
      "/catalog/filters/hydraulic-filter",
    );
  });

  it("adds and removes a product from the persistent request list", () => {
    render(<ProductCard product={product} />);

    fireEvent.click(screen.getByRole("button", { name: "В запрос" }));
    expect(screen.getByRole("button", { name: "Убрать из запроса" })).toBeInTheDocument();
    expect(localStorage.getItem("deere-shop:product-request-list")).toContain("RE123456");
    expect(
      screen.getByRole("link", { name: "Перейти к списку запроса: 1 поз." }),
    ).toHaveAttribute("href", "/#parts-request");

    fireEvent.click(screen.getByRole("button", { name: "Убрать из запроса" }));
    expect(localStorage.getItem("deere-shop:product-request-list")).toBe("[]");
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

  it("does not invent optional commercial labels", () => {
    render(
      <ProductCard
        product={{
          ...product,
          brand: null,
          partType: null,
          deliveryStatus: null,
        } as ProductCardData}
      />,
    );

    expect(screen.queryByText("John Deere")).not.toBeInTheDocument();
    expect(screen.queryByText("Оригинал")).not.toBeInTheDocument();
    expect(screen.queryByText("На складе поставщика")).not.toBeInTheDocument();
  });

  it("does not render a generic order status", () => {
    render(
      <ProductCard
        product={{ ...product, availabilityStatus: "on_request" }}
      />,
    );

    expect(screen.queryByText("Под заказ")).not.toBeInTheDocument();
  });
});
