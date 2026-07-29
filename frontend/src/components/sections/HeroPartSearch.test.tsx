import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ProductCardData } from "@/types/catalog";

import { HeroPartSearch } from "./HeroPartSearch";

const products: ProductCardData[] = [
  {
    id: "1",
    title: "Фильтр гидравлический",
    slug: "hydraulic-filter",
    sku: "RE57934",
    category: { id: "c1", title: "Фильтры", slug: "filters" },
    shortDescription: null,
    mainImageId: null,
    imageAlt: null,
    price: null,
    currency: "RUB",
    priceStatus: "on_request",
    availabilityStatus: "on_request",
  },
];

describe("HeroPartSearch", () => {
  it("submits the article query to the catalog", () => {
    render(<HeroPartSearch products={products} />);

    const input = screen.getByRole("combobox", { name: "Артикул детали" });
    fireEvent.change(input, { target: { value: "RE57934" } });

    expect(screen.getByRole("button", { name: "Найти" })).toBeEnabled();
    expect(input.closest("form")).toHaveAttribute("action", "/catalog");
    expect(input).toHaveAttribute("name", "q");
  });

  it("shows real product suggestions and supports keyboard selection", () => {
    render(<HeroPartSearch products={products} />);

    const input = screen.getByRole("combobox", { name: "Артикул детали" });
    fireEvent.change(input, { target: { value: "RE57" } });

    expect(
      screen.getByRole("option", { name: /RE57934.*Фильтр гидравлический/ }),
    ).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(input).toHaveValue("RE57934");
  });
});
