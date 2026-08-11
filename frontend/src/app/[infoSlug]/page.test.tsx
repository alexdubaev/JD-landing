import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentPage } from "@/types/content";

import InformationPage from "./page";

const {
  getFaqItemsMock,
  getPageBySlugMock,
  getSiteSettingsMock,
} = vi.hoisted(() => ({
  getFaqItemsMock: vi.fn(),
  getPageBySlugMock: vi.fn(),
  getSiteSettingsMock: vi.fn(),
}));

vi.mock("@/lib/directus/content", () => ({
  getFaqItems: getFaqItemsMock,
  getPageBySlug: getPageBySlugMock,
  getSiteSettings: getSiteSettingsMock,
}));

vi.mock("@/lib/seo/trust-pages", () => ({
  getTrustPageFallback: (slug: string) =>
    slug === "about"
      ? ({
          id: "frontend-about",
          title: "О компании",
          slug: "about",
          h1: "О компании DEERE-SHOP",
          seoTitle: null,
          seoDescription: null,
          seoText: null,
          sections: [],
        } satisfies ContentPage)
      : null,
  getTrustPageFaq: () => [],
  getTrustPageMetadata: () => null,
}));

vi.mock("@/components/pages/ContentPageView", () => ({
  ContentPageView: ({ page }: { page: ContentPage }) => <h1>{page.h1}</h1>,
}));

describe("information page fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPageBySlugMock.mockResolvedValue(null);
    getFaqItemsMock.mockResolvedValue([]);
    getSiteSettingsMock.mockResolvedValue({});
  });

  it("renders a fallback page without querying FAQs by its non-CMS identifier", async () => {
    render(await InformationPage({ params: Promise.resolve({ infoSlug: "about" }) }));

    expect(screen.getByRole("heading", { level: 1, name: "О компании DEERE-SHOP" })).toBeInTheDocument();
    expect(getFaqItemsMock).not.toHaveBeenCalled();
  });
});
