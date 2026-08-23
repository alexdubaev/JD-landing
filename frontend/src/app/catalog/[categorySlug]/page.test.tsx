import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Category } from "@/types/catalog";

import CategoryPage from "./page";

const {
  getCatalogPageMock,
  getCategoriesMock,
  getCategoryBySlugMock,
  getCategoryRedirectMock,
} = vi.hoisted(() => ({
  getCatalogPageMock: vi.fn(),
  getCategoriesMock: vi.fn(),
  getCategoryBySlugMock: vi.fn(),
  getCategoryRedirectMock: vi.fn(),
}));

vi.mock("@/lib/directus/catalog", () => ({
  getCatalogPage: getCatalogPageMock,
  getCategories: getCategoriesMock,
  getCategoryBySlug: getCategoryBySlugMock,
  getCategoryRedirect: getCategoryRedirectMock,
}));

vi.mock("@/lib/seo/category-content", () => ({
  getCategorySeoContent: vi.fn().mockReturnValue(null),
}));
vi.mock("@/components/catalog/CatalogControls", () => ({
  CatalogControls: () => null,
}));
vi.mock("@/components/catalog/EmptyCatalog", () => ({
  EmptyCatalog: () => <p>Пусто</p>,
}));
vi.mock("@/components/catalog/Pagination", () => ({
  Pagination: () => null,
}));
vi.mock("@/components/catalog/ProductGrid", () => ({
  ProductGrid: () => null,
}));
vi.mock("@/components/layout/Breadcrumbs", () => ({
  Breadcrumbs: ({ items }: { items: Array<{ label: string; href?: string }> }) => (
    <nav aria-label="Хлебные крошки">
      {items.map((item) =>
        item.href ? (
          <a href={item.href} key={item.label}>
            {item.label}
          </a>
        ) : (
          <span key={item.label}>{item.label}</span>
        ),
      )}
    </nav>
  ),
}));
vi.mock("@/components/seo/JsonLdSchema", () => ({
  JsonLdSchema: () => null,
}));
vi.mock("@/components/ui/Container", () => ({
  Container: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
  permanentRedirect: vi.fn(),
}));

const category: Category = {
  id: "engine",
  title: "Двигатель",
  slug: "engine",
  sortOrder: 1,
  parentId: null,
  description: "Компоненты двигателя",
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
};

const child: Category = {
  ...category,
  id: "filters",
  title: "Фильтры двигателя",
  slug: "engine-filters",
  sortOrder: 1,
  parentId: category.id,
};

describe("category page hierarchy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCategoryBySlugMock.mockResolvedValue(category);
    getCategoryRedirectMock.mockResolvedValue(null);
    getCategoriesMock.mockResolvedValue([category, child]);
    getCatalogPageMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 24,
    });
  });

  it("renders child categories before the product result area", async () => {
    render(
      await CategoryPage({
        params: Promise.resolve({ categorySlug: category.slug }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(
      screen.getByRole("link", { name: "Фильтры двигателя" }),
    ).toHaveAttribute("href", "/catalog/engine-filters");
    expect(getCategoriesMock).toHaveBeenCalledOnce();
  });

  it("keeps the category page available when the hierarchy query fails", async () => {
    getCategoriesMock.mockRejectedValue(new Error("CMS unavailable"));

    render(
      await CategoryPage({
        params: Promise.resolve({ categorySlug: category.slug }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByRole("heading", { level: 1, name: category.title })).toBeInTheDocument();
  });
});
