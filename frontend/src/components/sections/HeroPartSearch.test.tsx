import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProductCardData } from "@/types/catalog";

import { HeroPartSearch, normalizePartQuery } from "./HeroPartSearch";

const searchProps = {
  label: "Поиск запчасти",
  placeholder: "Артикул или название",
  buttonText: "Искать",
  bulkPrompt: "Есть список деталей?",
  bulkLink: { text: "Вставить список", url: "/parts-request" },
  excelLink: { text: "Загрузить таблицу", url: "/parts-request?mode=excel#attachments" },
  photoLink: { text: "Приложить фото", url: "/parts-request?mode=photo#attachments" },
};

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
  it("routes each editable bulk-request scenario to its configured URL", () => {
    render(<HeroPartSearch {...searchProps} />);

    expect(screen.getByRole("link", { name: "Вставить список" })).toHaveAttribute(
      "href", "/parts-request",
    );
    expect(screen.getByRole("link", { name: "Загрузить таблицу" })).toHaveAttribute(
      "href", "/parts-request?mode=excel#attachments",
    );
    expect(screen.getByRole("link", { name: "Приложить фото" })).toHaveAttribute(
      "href", "/parts-request?mode=photo#attachments",
    );
    expect(screen.getByText("Есть список деталей?")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Способы отправить запрос" })).toHaveClass(
      "hero-part-search__scenarios",
    );
  });

  it("submits the article query to the catalog with editable labels", () => {
    render(<HeroPartSearch {...searchProps} />);
    const input = screen.getByRole("combobox", { name: "Поиск запчасти" });
    fireEvent.change(input, { target: { value: "RE57934" } });
    expect(input).toHaveAttribute("placeholder", "Артикул или название");
    expect(screen.getByRole("button", { name: "Искать" })).toBeEnabled();
    expect(input.closest("form")).toHaveAttribute("action", "/catalog");
  });

  it("requests normalized server suggestions instead of receiving a product dataset", async () => {
    expect(normalizePartQuery(" re-57 934 ")).toBe("re57934");
    const fetchMock = mockSuggestions();
    render(<HeroPartSearch {...searchProps} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Поиск запчасти" }), {
      target: { value: "re-57 934" },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain("q=re-57%20934");
    expect(await screen.findByRole("option", { name: /RE57934/ })).toBeInTheDocument();
  });

  it("renders product-url options with active-descendant keyboard support", async () => {
    mockSuggestions();
    render(<HeroPartSearch {...searchProps} />);
    const input = screen.getByRole("combobox", { name: "Поиск запчасти" });
    fireEvent.change(input, { target: { value: "RE57" } });
    const option = await screen.findByRole("option", { name: /RE57934.*Фильтр гидравлический/ });
    expect(option).toHaveAttribute("href", "/catalog/filters/hydraulic-filter");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", option.id);
  });

  it("clears stale suggestions when the normalized query becomes too short", async () => {
    mockSuggestions();
    render(<HeroPartSearch {...searchProps} />);
    const input = screen.getByRole("combobox", { name: "Поиск запчасти" });
    fireEvent.change(input, { target: { value: "RE57" } });
    expect(await screen.findByRole("option", { name: /RE57934/ })).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "R" } });
    await waitFor(() => expect(screen.queryByRole("option")).not.toBeInTheDocument());
    expect(input).toHaveAttribute("aria-expanded", "false");
  });
});
