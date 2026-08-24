import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PageSection, SiteSettings } from "@/types/content";

import { HomeHero } from "./HomeHero";

const heroSection: PageSection = {
  id: "hero",
  type: "hero",
  title: "Редактируемый заголовок John Deere",
  subtitle: null,
  text: "Редактируемое описание главного экрана.",
  imageId: "9af727df-c55a-48d9-bbd0-458a18237068",
  imageAlt: "Запчасти для техники John Deere",
  buttonText: "Получить консультацию",
  buttonUrl: "#consultation",
  items: [],
  settings: {
    search_label: "Поиск запчасти",
    search_placeholder: "Артикул или название",
    search_button_text: "Искать",
    bulk_prompt: "Есть список деталей?",
    bulk_link_text: "Вставить список",
    bulk_link_url: "/parts-request",
    excel_link_text: "Загрузить таблицу",
    excel_link_url: "/parts-request?mode=excel#attachments",
    photo_link_text: "Приложить фото",
    photo_link_url: "/parts-request?mode=photo#attachments",
  },
  sortOrder: 0,
};

describe("HomeHero", () => {
  it("renders the editable Directus hero image, copy, and CTA", () => {
    const { container } = render(
      <HomeHero
        contacts={[]}
        section={heroSection}
        settings={{ phone: null } as SiteSettings}
      />,
    );

    const image = container.querySelector(".commerce-hero__image");
    expect(image?.parentElement).toHaveClass("commerce-hero__assembly");
    expect(image).toHaveAttribute("alt", "Запчасти для техники John Deere");
    expect(decodeURIComponent(image?.getAttribute("src") ?? "")).toContain(
      "/media/9af727df-c55a-48d9-bbd0-458a18237068?format=webp&quality=84&width=1920",
    );
    expect(container).toHaveTextContent("Редактируемый заголовок John Deere");
    expect(container).toHaveTextContent("Редактируемое описание главного экрана.");
    expect(container).toHaveTextContent("Получить консультацию");
  });

  it("marks the hero contact group for mobile-only hiding", () => {
    const { container } = render(
      <HomeHero
        contacts={[{
          id: "phone",
          type: "phone",
          label: "Телефон",
          value: "+7 900 000-00-00",
          url: null,
          icon: null,
        }]}
        section={heroSection}
        settings={{ phone: null } as SiteSettings}
      />,
    );

    expect(container.querySelector(".commerce-hero__contacts")).toHaveClass(
      "commerce-hero__contacts--desktop-only",
    );
  });

  it("renders only benefit cards configured in the CMS", () => {
    const benefitsSection: PageSection = {
      ...heroSection,
      id: "advantages",
      type: "advantages",
      items: [
        { icon: "shield", title: "Качество", text: "Проверено." },
        { icon: "package", title: "Склад", text: "Доступно." },
        { icon: "truck", title: "Доставка", text: "Быстро." },
      ],
    };
    const { container } = render(
      <HomeHero
        benefitsSection={benefitsSection}
        contacts={[]}
        section={heroSection}
        settings={{ phone: null } as SiteSettings}
      />,
    );

    expect(container.querySelectorAll(".commerce-hero__benefit")).toHaveLength(3);
  });
});
