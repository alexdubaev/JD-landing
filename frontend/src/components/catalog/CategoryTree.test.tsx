import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Category } from "@/types/catalog";

import { buildCategoryTree } from "@/lib/catalog/category-tree";

import { CategoryTree } from "./CategoryTree";

const categories = [
  {
    id: "engine",
    title: "Двигатель",
    slug: "engine",
    sortOrder: 1,
    parentId: null,
    description: null,
    imageId: null,
    imageAlt: null,
    iconId: null,
    iconAlt: null,
    h1: null,
    seoTitle: null,
    seoDescription: null,
    seoText: null,
    intro: null,
    selectionGuide: [],
    internalLinks: [],
    ogImageId: null,
    isIndexable: true,
    redirectTarget: null,
  },
  {
    id: "filters",
    title: "Фильтры двигателя",
    slug: "engine-filters",
    sortOrder: 1,
    parentId: "engine",
    description: null,
    imageId: null,
    imageAlt: null,
    iconId: null,
    iconAlt: null,
    h1: null,
    seoTitle: null,
    seoDescription: null,
    seoText: null,
    intro: null,
    selectionGuide: [],
    internalLinks: [],
    ogImageId: null,
    isIndexable: true,
    redirectTarget: null,
  },
] satisfies Category[];

describe("CategoryTree", () => {
  it("renders indexable nested categories as accessible links", () => {
    render(<CategoryTree nodes={buildCategoryTree(categories)} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Категории каталога" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Двигатель" })).toHaveAttribute(
      "href",
      "/catalog/engine",
    );
    expect(screen.getByRole("link", { name: "Двигатель" })).toHaveClass(
      "category-tree__link--parent",
    );
    expect(
      screen.getByRole("link", { name: "Фильтры двигателя" }),
    ).toHaveAttribute("href", "/catalog/engine-filters");
    expect(
      screen.getByRole("link", { name: "Фильтры двигателя" }),
    ).toHaveClass("category-tree__link--category");
  });
});
