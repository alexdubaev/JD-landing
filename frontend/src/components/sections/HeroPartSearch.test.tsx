import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProductCardData } from "@/types/catalog";

import { HeroPartSearch, normalizePartQuery } from "./HeroPartSearch";

const products: ProductCardData[] = [{
  id: "1", title: "Фильтр гидравлический", slug: "hydraulic-filter", sku: "RE57934",
  category: { id: "c1", title: "Фильтры", slug: "filters" }, shortDescription: null,
  mainImageId: null, imageAlt: null, price: null, currency: "RUB",
  priceStatus: "on_request", availabilityStatus: "on_request",
}];

afterEach(() => vi.restoreAllMocks());
const mockSuggestions = () => vi.spyOn(globalThis, "fetch").mockResolvedValue(
  new Response(JSON.stringify({ items: products }), { status: 200 }),
);

describe("HeroPartSearch", () => {
  it("routes each bulk-request scenario to its dedicated page mode", () => {
    render(<HeroPartSearch />);

    expect(screen.getByRole("link", { name: "Вставить список" })).toHaveAttribute(
      "href",
      "/parts-request",
    );
    expect(screen.getByRole("link", { name: "Загрузить Excel" })).toHaveAttribute(
      "href",
      "/parts-request?mode=excel#attachments",
    );
    expect(screen.getByRole("link", { name: "Отправить фото" })).toHaveAttribute(
      "href",
      "/parts-request?mode=photo#attachments",
    );
  });

  it("submits the article query to the catalog", () => {
    render(<HeroPartSearch />);
    const input = screen.getByRole("combobox", { name: "Артикул детали" });
    fireEvent.change(input, { target: { value: "RE57934" } });
    expect(screen.getByRole("button", { name: "Найти" })).toBeEnabled();
    expect(input.closest("form")).toHaveAttribute("action", "/catalog");
  });

  it("requests normalized server suggestions instead of receiving a product dataset", async () => {
    expect(normalizePartQuery(" re-57 934 ")).toBe("re57934");
    const fetchMock = mockSuggestions();
    render(<HeroPartSearch />);
    fireEvent.change(screen.getByRole("combobox", { name: "Артикул детали" }), {
      target: { value: "re-57 934" },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain("q=re-57%20934");
    expect(await screen.findByRole("option", { name: /RE57934/ })).toBeInTheDocument();
  });

  it("renders product-url options with active-descendant keyboard support", async () => {
    mockSuggestions();
    render(<HeroPartSearch />);
    const input = screen.getByRole("combobox", { name: "Артикул детали" });
    fireEvent.change(input, { target: { value: "RE57" } });
    const option = await screen.findByRole("option", { name: /RE57934.*Фильтр гидравлический/ });
    expect(option).toHaveAttribute("href", "/catalog/filters/hydraulic-filter");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", option.id);
  });

  it("clears stale suggestions when the normalized query becomes too short", async () => {
    mockSuggestions();
    render(<HeroPartSearch />);
    const input = screen.getByRole("combobox", { name: "Артикул детали" });
    fireEvent.change(input, { target: { value: "RE57" } });
    expect(await screen.findByRole("option", { name: /RE57934/ })).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "R" } });
    await waitFor(() => expect(screen.queryByRole("option")).not.toBeInTheDocument());
    expect(input).toHaveAttribute("aria-expanded", "false");
  });
});
