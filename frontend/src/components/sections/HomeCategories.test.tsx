import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Category } from "@/types/catalog";
import type { PageSection } from "@/types/content";

import { HomeCategories } from "./HomeCategories";

const category: Category = {
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
        .getByRole("link", { name: "Фильтры — перейти в каталог" })
        .closest("article"),
    ).toHaveClass("home-category--text-only");
  });
});
