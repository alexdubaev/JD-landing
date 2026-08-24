import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ContentPage, SiteSettings } from "@/types/content";

import { ContentPageView } from "./ContentPageView";

const page: ContentPage = {
  id: "frontend-about",
  title: "О компании",
  slug: "about",
  h1: "О компании DEERE-SHOP",
  seoTitle: null,
  seoDescription: null,
  seoText: null,
  sections: [{
    id: "about-purpose",
    type: "seo_text",
    title: "Чем занимается DEERE-SHOP",
    subtitle: null,
    text: "Помогаем подготовить запрос на подбор запчастей.",
    imageId: null,
    buttonText: null,
    buttonUrl: null,
    items: [],
    settings: {},
    sortOrder: 0,
  }],
};

describe("content page view", () => {
  it("renders editable text sections as visible information-page content", () => {
    const { container } = render(
      <ContentPageView faq={[]} page={page} settings={{} as SiteSettings} />,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Чем занимается DEERE-SHOP" })).toBeVisible();
    expect(container.querySelector(".content-page__section")).toBeInTheDocument();
    expect(container.querySelector(".home-seo")).not.toBeInTheDocument();
  });

  it("renders paragraph breaks and editorial list items from a CMS section", () => {
    render(
      <ContentPageView
        faq={[]}
        page={{
          id: "about",
          title: "Компания",
          slug: "about",
          h1: "О компании",
          seoTitle: null,
          seoDescription: null,
          seoText: null,
          sections: [{
            id: "details",
            type: "seo_text",
            title: "Подбор",
            subtitle: null,
            text: "Первый абзац.\n\nВторой абзац.",
            imageId: null,
            buttonText: null,
            buttonUrl: null,
            items: ["артикул", "модель техники"],
            settings: {},
            sortOrder: 0,
          }],
        }}
        settings={{ companyName: "DEERE-SHOP" } as never}
      />,
    );

    expect(screen.getByText("Первый абзац.")).toBeInTheDocument();
    expect(screen.getByText("Второй абзац.")).toBeInTheDocument();
    const list = document.querySelector(".content-page__list");
    expect(list).toHaveTextContent("артикул");
    expect(list).toHaveTextContent("модель техники");
  });
});
