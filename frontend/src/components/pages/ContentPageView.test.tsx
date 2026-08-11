import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ContentPageView } from "./ContentPageView";

describe("ContentPageView", () => {
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
