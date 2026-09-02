import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ContentPage, PageSection, SiteSettings } from "@/types/content";

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

const section = (overrides: Partial<PageSection>): PageSection => ({
  id: "cms-section",
  type: "seo_text",
  title: null,
  subtitle: null,
  text: null,
  imageId: null,
  buttonText: null,
  buttonUrl: null,
  items: [],
  settings: {},
  sortOrder: 0,
  ...overrides,
});

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

  it("uses CMS section types instead of opaque IDs for the hero and delivery route", () => {
    const { container } = render(
      <ServicePageView
        faq={[]}
        page={{
          ...deliveryPage,
          sections: [
            section({ id: "intro-72", type: "hero", text: "Условия из CMS." }),
            section({ id: "route-18", type: "process", items: ["Проверяем запрос."] }),
          ],
        }}
        settings={{ companyName: "DEERE-SHOP" } as SiteSettings}
      />,
    );

    expect(container.querySelector(".service-page__hero")).toHaveTextContent("Условия из CMS.");
    const route = container.querySelector(".service-page__route");
    expect(route).toBeInTheDocument();
    expect(within(route as HTMLElement).getByText("Проверяем запрос.")).toBeInTheDocument();
  });

  it("uses the parts request type for a CMS contact request with an opaque ID", () => {
    const { container } = render(
      <ServicePageView
        faq={[]}
        page={{
          ...deliveryPage,
          slug: "contacts",
          title: "Контакты",
          h1: "Контакты",
          sections: [
            section({ id: "intro-92", type: "hero", text: "Укажите артикул." }),
            section({
              id: "request-51",
              type: "parts_request",
              title: "Что подготовить",
              items: ["Артикул"],
            }),
          ],
        }}
        settings={{ companyName: "DEERE-SHOP" } as SiteSettings}
      />,
    );

    expect(container.querySelector(".service-page__sections #request-51")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Что подготовить" })).toBeInTheDocument();
  });

  it("does not invent contact channels when SiteSettings contains none", () => {
    render(
      <ServicePageView
        faq={[]}
        page={{ ...deliveryPage, slug: "contacts", title: "Контакты", h1: "Контакты" }}
        settings={{ companyName: "DEERE-SHOP", phone: null, email: null } as SiteSettings}
      />,
    );

    expect(screen.queryAllByText("8 911 921 22 14")).toHaveLength(0);
    expect(screen.queryAllByText("info@cmteh.ru")).toHaveLength(0);
    expect(screen.queryByLabelText("Контактные данные")).not.toBeInTheDocument();
  });
});
