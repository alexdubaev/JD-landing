import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CatalogControls } from "./CatalogControls";

const replace = vi.fn();
const categories = [
  {
    id: "filters",
    title: "Фильтры",
    slug: "filters",
    parentId: null,
    description: null,
    imageId: null,
    imageAlt: null,
    h1: null,
    seoTitle: null,
    seoDescription: null,
    seoText: null,
    ogImageId: null, intro: null, selectionGuide: [], internalLinks: [], isIndexable: true, redirectTarget: null, },
];

vi.mock("next/navigation", () => ({
  usePathname: () => "/catalog",
  useRouter: () => ({ replace }),
  useSearchParams: () =>
    new URLSearchParams(
      "availability=in_stock&q=filter&category=filters&sort=title_asc",
    ),
}));

describe("CatalogControls", () => {
  beforeEach(() => replace.mockClear());

  it("opens a keyboard-accessible mobile filter drawer and shows active filters", async () => {
    render(<CatalogControls categories={categories} />);

    expect(screen.getByText("В наличии", { selector: "button" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Открыть фильтры" }));
    await waitFor(() =>
      expect(
        screen.getByRole("dialog", { name: "Фильтры каталога" }),
      ).toBeVisible(),
    );
  });

  it("clears search and filters while preserving the selected sort order", () => {
    render(<CatalogControls categories={categories} />);

    fireEvent.click(screen.getByRole("button", { name: "Сбросить все" }));

    expect(replace).toHaveBeenCalledWith("/catalog?sort=title_asc");
  });
});
