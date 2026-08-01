import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Category, ProductCardData } from "@/types/catalog";
import type { ContentPage, FaqItem, SiteSettings } from "@/types/content";

import { HomePageView } from "./HomePageView";

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
      imageId: null,
      buttonText: "Перейти в каталог",
      buttonUrl: "/catalog",
      items: [],
      settings: { secondary_cta_text: "Получить консультацию" },
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
  inn: null,
  kpp: null,
  legalAddress: null,
  legalName: null,
  messengers: [],
  ogrn: null,
  requisitesUrl: null,
  vatInfo: null,
};

const categories: Category[] = [
  {
    id: "engine",
    title: "Двигатель",
    slug: "engine",
    parentId: null,
    description: "Компоненты двигателя",
    imageId: null,
    imageAlt: null,
    h1: null,
    seoTitle: null,
    seoDescription: null,
    seoText: null,
    ogImageId: null,
  },
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
      screen.getByRole("combobox", { name: "Артикул детали" }),
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
