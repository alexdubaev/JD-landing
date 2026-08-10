import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PageSection, SiteSettings } from "@/types/content";

import { HomeHero } from "./HomeHero";

const heroSection: PageSection = {
  id: "hero",
  type: "hero",
  title: null,
  subtitle: null,
  text: null,
  imageId: null,
  buttonText: null,
  buttonUrl: null,
  items: [],
  settings: {},
  sortOrder: 0,
};

const incompleteBenefits: PageSection = {
  ...heroSection,
  id: "advantages",
  type: "advantages",
  items: [
    { icon: "shield", title: "Гарантия качества", text: "Проверяем товары." },
    { icon: "package", title: "Собственные склады", text: "Храним позиции." },
    { icon: "truck", title: "Быстрая доставка", text: "Отправляем по России." },
  ],
};

describe("HomeHero", () => {
  it("requests the CMS hero image without a crop transform", () => {
    render(
      <HomeHero
        contacts={[]}
        h1="Запчасти John Deere"
        section={{ ...heroSection, imageId: "hero-photo" }}
        settings={{ phone: null } as SiteSettings}
      />,
    );

    const image = screen.getByAltText("Трактор John Deere в поле");
    expect(image.getAttribute("src")).toContain("%2Fmedia%2Fhero-photo");
    expect(image.getAttribute("src")).not.toContain("fit%3Dcover");
  });

  it("keeps four benefit cards when CMS provides an incomplete set", () => {
    const { container } = render(
      <HomeHero
        benefitsSection={incompleteBenefits}
        contacts={[]}
        h1="Запчасти John Deere"
        section={heroSection}
        settings={{ phone: null } as SiteSettings}
      />,
    );

    expect(container.querySelectorAll(".commerce-hero__benefit")).toHaveLength(4);
    expect(container).toHaveTextContent("Гарантия качества");
    expect(container).toHaveTextContent("Собственные склады");
    expect(container).toHaveTextContent("Быстрая доставка");
    expect(container).toHaveTextContent("Поддержка 24/7");
  });
});
