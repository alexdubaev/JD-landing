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
  ogImageId: null,
};

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

  it("keeps the CMS homepage order, excludes obvious misc categories and caps output", () => {
    const categories = [
      { ...category, id: "hydraulics", title: "Гидравлика", slug: "hydraulics" },
      { ...category, id: "engine", title: "Двигатель", slug: "engine" },
      { ...category, id: "misc", title: "Прочее", slug: "misc" },
      { ...category, id: "electrics", title: "Электрика", slug: "electrics" },
    ];

    expect(getHomepageCategories(categories).map(({ title }) => title)).toEqual([
      "Гидравлика",
      "Двигатель",
      "Электрика",
    ]);
  });

  it("uses the all-categories label for the catalog entry point", () => {
    render(<HomeCategories categories={[category]} section={section} />);

    expect(
      screen.getByRole("link", { name: "Смотреть все категории" }),
    ).toHaveAttribute("href", "/catalog");
  });
});
