import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Category, ProductCardData } from "@/types/catalog";
import type { ContentPage, FaqItem, SiteSettings } from "@/types/content";

import { HomePageView } from "./HomePageView";
import { dynamic as homePageDynamic } from "./page";

describe("HomePage runtime rendering", () => {
  it("does not prerender a CMS-unavailable fallback during the Docker build", () => {
    expect(homePageDynamic).toBe("force-dynamic");
  });
});

const page: ContentPage = {
  id: "home",
  title: "Главная",
  slug: "home",
  h1: "Запчасти и комплектующие для техники John Deere",
  seoTitle: "Каталог",
  seoDescription: "Описание",
  seoText: "Помогаем подобрать комплектующие под задачи клиента.",
  sections: [
    {
      id: "hero",
      type: "hero",
      title: "Запчасти и комплектующие для техники John Deere",
      subtitle: "Подбор по артикулу и модели техники",
      text: "Проверим запрос и уточним условия поставки.",
      imageId: "9af727df-c55a-48d9-bbd0-458a18237068",
      imageAlt: "Трактор John Deere в поле",
      buttonText: "Перейти в каталог",
      buttonUrl: "/catalog",
      items: [],
      settings: {
        search_label: "Поиск по каталогу",
        search_placeholder: "Введите артикул детали",
        search_button_text: "Найти",
        bulk_prompt: "Нужно проверить несколько позиций?",
        bulk_link_text: "Вставить список",
        bulk_link_url: "/parts-request",
        excel_link_text: "Загрузить Excel",
        excel_link_url: "/parts-request?mode=excel#attachments",
        photo_link_text: "Отправить фото",
        photo_link_url: "/parts-request?mode=photo#attachments",
      },
      sortOrder: 1,
    },
    {
      id: "categories",
      type: "categories",
      title: "Категории запчастей",
      subtitle: "Основные направления",
      text: null,
      imageId: null,
      buttonText: "Смотреть весь каталог",
      buttonUrl: "/catalog",
      items: [],
      settings: {},
      sortOrder: 2,
    },
    {
      id: "featured",
      type: "featured_products",
      title: "Популярные товары",
      subtitle: "Каталог",
      text: null,
      imageId: null,
      buttonText: null,
      buttonUrl: null,
      items: [],
      settings: {},
      sortOrder: 3,
    },
    {
      id: "parts-request",
      type: "parts_request",
      title: "Проверьте список запчастей",
      subtitle: "Проверка нескольких позиций",
      text: "Вставьте артикулы или загрузите файл.",
      imageId: null,
      buttonText: null,
      buttonUrl: null,
      items: ["Цена", "Наличие"],
      settings: {},
      sortOrder: 3,
    },
    {
      id: "faq",
      type: "faq",
      title: "Вопросы и ответы",
      subtitle: null,
      text: null,
      imageId: null,
      buttonText: null,
      buttonUrl: null,
      items: [],
      settings: {},
      sortOrder: 4,
    },
  ],
};

const settings: SiteSettings = {
  city: null,
  companyImageId: null,
  companyName: "DEERE-SHOP",
  defaultOgImageId: null,
  documentsUrl: null,
  phone: "+7 900 000-00-00",
  email: "info@example.test",
  address: "Санкт-Петербург",
  workingHours: "Пн–Пт 09:00–18:00",
  logoId: null,
  primaryColor: null,
  accentColor: null,
  primaryCtaText: "Получить консультацию",
  primaryCtaUrl: "/contacts",
  footerText: null,
  footerDisclaimer: null,
  seoTitle: null,
  seoDescription: null,
  ogTitle: null,
  ogDescription: null,
  inn: null,
  kpp: null,
  legalAddress: null,
  legalName: null,
  messengers: [],
  ogrn: null,
  requisitesUrl: null,
  vatInfo: null,
  yandexMetricaId: null,
  gtmId: null,
};

const categories: Category[] = [
  {
    id: "engine",
    title: "Двигатель",
    slug: "engine",
    sortOrder: 0,
    parentId: null,
    description: "Компоненты двигателя",
    imageId: null,
    imageAlt: null,
    h1: null,
    seoTitle: null,
    seoDescription: null,
    seoText: null,
    ogImageId: null, intro: null, selectionGuide: [], internalLinks: [], isIndexable: true, redirectTarget: null, },
];

const products: ProductCardData[] = [
  {
    id: "product",
    title: "Фильтр",
    slug: "filter",
    sku: "TEST-1",
    category: { id: "engine", title: "Двигатель", slug: "engine" },
    shortDescription: "Тестовый товар",
    mainImageId: "product-image",
    imageAlt: null,
    price: 120000,
    currency: "RUB",
    priceStatus: "fixed",
    availabilityStatus: "on_request",
    deliveryStatus: "Срок уточняется",
  },
];

const faq: FaqItem[] = [
  {
    id: "request",
    question: "Как отправить запрос?",
    answer: "Через форму на сайте.",
  },
];

describe("HomePageView", () => {
  it("does not invent optional sections that are absent from Directus", () => {
    render(
      <HomePageView
        articles={[]}
        categories={[]}
        contacts={[]}
        faq={[]}
        page={{ ...page, sections: [page.sections[0]] }}
        products={[]}
        supplies={[]}
        settings={settings}
      />,
    );

    expect(screen.queryByText("Категории продукции")).not.toBeInTheDocument();
    expect(screen.queryByText("Избранные товары")).not.toBeInTheDocument();
    expect(screen.queryByText("Вопросы и ответы")).not.toBeInTheDocument();
  });

  it("renders primary homepage sections in CMS sort order", () => {
    const orderedSections: ContentPage["sections"] = [
      page.sections[0],
      { ...page.sections[1], id: "categories-late", sortOrder: 20, title: "Категории позже" },
      { ...page.sections[1], id: "trust-early", type: "company_trust", sortOrder: 10, title: "О компании раньше" },
    ];
    const { container } = render(
      <HomePageView
        articles={[]}
        categories={categories}
        contacts={[]}
        faq={[]}
        page={{ ...page, sections: orderedSections }}
        products={[]}
        supplies={[]}
        settings={settings}
      />,
    );

    expect(container.textContent?.indexOf("О компании раньше")).toBeLessThan(
      container.textContent?.indexOf("Категории позже") ?? -1,
    );
  });

  it("renders CMS sections with catalog data and accessible entry points", () => {
    render(
      <HomePageView
        articles={[]}
        categories={categories}
        contacts={[]}
        faq={faq}
        page={page}
        products={products}
        supplies={[]}
        settings={settings}
      />,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /запчасти.*john deere/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("search", { name: /поиск по каталогу/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Поиск по каталогу" }),
    ).toHaveAttribute("name", "q");
    expect(
      screen.getByRole("heading", { name: "Категории запчастей" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Проверьте список запчастей" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Фильтр")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Как отправить запрос?" }),
    ).toBeInTheDocument();
  });

  it("omits homepage SEO copy and renders one combined contact form hub", () => {
    const extraSections: ContentPage["sections"] = [
      {
        id: "seo",
        type: "seo_text",
        title: "Не показывать",
        subtitle: null,
        text: "Скрытый SEO-текст главной",
        imageId: null,
        buttonText: null,
        buttonUrl: null,
        items: [],
        settings: {},
        sortOrder: 8,
      },
      {
        id: "contacts",
        type: "contacts",
        title: "Свяжитесь с нами",
        subtitle: null,
        text: "Контактные данные",
        imageId: null,
        buttonText: null,
        buttonUrl: null,
        items: [],
        settings: {},
        sortOrder: 9,
      },
      {
        id: "lead",
        type: "lead_form",
        title: "Оставьте заявку",
        subtitle: null,
        text: "Форма",
        imageId: null,
        buttonText: null,
        buttonUrl: null,
        items: [],
        settings: {},
        sortOrder: 10,
      },
    ];
    const { container } = render(
      <HomePageView
        articles={[]}
        categories={categories}
        contacts={[]}
        faq={faq}
        page={{ ...page, sections: [...page.sections, ...extraSections] }}
        products={products}
        supplies={[]}
        settings={settings}
      />,
    );

    expect(screen.queryByText("Скрытый SEO-текст главной")).not.toBeInTheDocument();
    expect(container.querySelectorAll("#consultation")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Свяжитесь с нами" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Оставьте заявку" })).toBeInTheDocument();
  });
});
