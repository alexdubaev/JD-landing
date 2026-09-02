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
  ContentPageView: ({ page }: { page: ContentPage }) => <div data-testid="content-page">{page.h1}</div>,
}));

vi.mock("@/components/pages/ServicePageView", () => ({
  ServicePageView: ({ page }: { page: ContentPage }) => <h1 data-testid="service-page">{page.h1}</h1>,
}));

describe("information page fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPageBySlugMock.mockResolvedValue(null);
    getFaqItemsMock.mockResolvedValue([]);
    getSiteSettingsMock.mockResolvedValue({});
  });

  it("uses the service presentation for a fallback service route without querying FAQs by its non-CMS identifier", async () => {
    render(await InformationPage({ params: Promise.resolve({ infoSlug: "about" }) }));

    expect(screen.getByTestId("service-page")).toHaveTextContent("О компании DEERE-SHOP");
    expect(screen.queryByTestId("content-page")).not.toBeInTheDocument();
    expect(getFaqItemsMock).not.toHaveBeenCalled();
  });
});
