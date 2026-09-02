import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ContentPage, SiteSettings } from "@/types/content";

import { ServicePageView } from "./ServicePageView";

const deliveryPage: ContentPage = {
  id: "delivery",
  title: "Доставка и оплата",
  slug: "delivery",
  h1: "Доставка и оплата",
  seoTitle: null,
  seoDescription: null,
  seoText: null,
  sections: [],
};

describe("service page view", () => {
  it("renders the delivery route as a distinct factual service page", () => {
    render(
      <ServicePageView
        faq={[]}
        page={deliveryPage}
        settings={{ companyName: "DEERE-SHOP" } as SiteSettings}
      />,
    );

    expect(screen.getByRole("main")).toHaveClass(
      "service-page",
      "service-page--delivery",
    );
    expect(
      screen.getByRole("heading", { level: 1, name: deliveryPage.h1 }),
    ).toBeInTheDocument();
  });
});
