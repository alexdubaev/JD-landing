import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentPage } from "@/types/content";

import PartsRequestPage, { generateMetadata } from "./page";

const { getPageBySlugMock, notFoundMock } = vi.hoisted(() => ({
  getPageBySlugMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
}));

vi.mock("@/lib/directus/content", () => ({
  getPageBySlug: getPageBySlugMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

const page: ContentPage = {
  id: "parts-request-page",
  title: "Проверка списка запчастей",
  slug: "parts-request",
  h1: "Проверка списка запчастей",
  seoTitle: "Проверка списка запчастей John Deere — DEERE-SHOP",
  seoDescription: "Отправьте список артикулов, Excel/CSV или фотографии маркировки.",
  seoText: null,
  sections: [{
    id: "parts-request-section",
    type: "parts_request",
    title: "Проверьте список запчастей",
    subtitle: "Проверка нескольких позиций",
    text: "Вставьте артикулы или загрузите файл.",
    imageId: null,
    buttonText: null,
    buttonUrl: null,
    items: ["Цена", "Наличие"],
    settings: {},
    sortOrder: 0,
  }],
};

describe("parts request page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPageBySlugMock.mockResolvedValue(page);
  });

  it("renders CMS content, breadcrumbs, schema and the requested attachment mode", async () => {
    const { container } = render(await PartsRequestPage({
      searchParams: Promise.resolve({ mode: "excel" }),
    }));

    expect(screen.getByRole("heading", { level: 1, name: page.h1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Главная" })).toHaveAttribute("href", "/");
    await waitFor(() => expect(screen.getByRole("button", { name: "Загрузить Excel" })).toHaveClass("is-active"));
    const schemas = [...container.querySelectorAll("script[type='application/ld+json']")]
      .map((node) => JSON.parse(node.textContent ?? "{}"));
    expect(schemas.map((schema) => schema["@type"])).toContain("BreadcrumbList");
  });

  it("returns canonical CMS metadata", async () => {
    const metadata = await generateMetadata();
    expect(metadata).toMatchObject({
      title: page.seoTitle,
      description: page.seoDescription,
      alternates: { canonical: "/parts-request" },
    });
  });
});
