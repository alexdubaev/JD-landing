import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Category } from "@/types/catalog";
import type { PageSection } from "@/types/content";

import { getHomepageCategories, HomeCategories } from "./HomeCategories";

const category: Category = {
  id: "engine",
  title: "Двигатель",
  slug: "engine",
  parentId: null,
  description: null,
  imageId: null,
  imageAlt: null,
  h1: null,
  seoTitle: null,
  seoDescription: null,
  seoText: null,
  ogImageId: null, intro: null, selectionGuide: [], internalLinks: [], isIndexable: true, redirectTarget: null, };

const section: PageSection = {
  id: "categories",
  type: "categories",
  title: "Категории продукции",
  subtitle: "Каталог",
  text: null,
  imageId: null,
  buttonText: "Весь каталог",
  buttonUrl: "/catalog",
  items: [],
  settings: {},
  sortOrder: 1,
};

describe("HomeCategories", () => {
  it("uses a compact text-only treatment when a category has no CMS image", () => {
    render(<HomeCategories categories={[category]} section={section} />);

    expect(
      screen
        .getByRole("link", { name: "Двигатель — перейти в каталог" })
        .closest("article"),
    ).toHaveClass("home-category--text-only");
  });

  it("tracks a homepage category selection", () => {
    window.dataLayer = [];
    render(<HomeCategories categories={[category]} section={section} />);
    const link = screen.getByRole("link", { name: "Двигатель — перейти в каталог" });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(window.dataLayer).toContainEqual({ event: "category_view", category_id: "engine" });
  });

  it("keeps the CMS homepage order, excludes obvious misc categories and shows twelve categories", () => {
    const categories = Array.from({ length: 12 }, (_, index) => ({
      ...category,
      id: `category-${index + 1}`,
      title: `Категория ${index + 1}`,
      slug: `category-${index + 1}`,
    }));
    categories.splice(2, 0,
      { ...category, id: "misc", title: "Прочее", slug: "misc" },
    );

    expect(getHomepageCategories(categories)).toHaveLength(12);
    expect(getHomepageCategories(categories).map(({ title }) => title)).toEqual(
      Array.from({ length: 12 }, (_, index) => `Категория ${index + 1}`),
    );
  });

  it("uses the all-categories label for the catalog entry point", () => {
    render(<HomeCategories categories={[category]} section={section} />);

    expect(
      screen.getByRole("link", { name: "Смотреть все категории" }),
    ).toHaveAttribute("href", "/catalog");
  });

  it("does not add a duplicate all-categories card to the twelve-cell desktop grid", () => {
    const categories = Array.from({ length: 12 }, (_, index) => ({
      ...category,
      id: `category-${index + 1}`,
      title: `Категория ${index + 1}`,
      slug: `category-${index + 1}`,
    }));

    render(<HomeCategories categories={categories} section={section} />);

    expect(screen.getAllByRole("link")).toHaveLength(13);
    expect(
      screen.queryByRole("link", { name: "Все категории — перейти в каталог" }),
    ).not.toBeInTheDocument();
  });
});
