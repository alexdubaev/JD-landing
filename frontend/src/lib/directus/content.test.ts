import { beforeEach, describe, expect, it, vi } from "vitest";

import { directusRequest } from "./client";
import {
  getFaqItems,
  getContacts,
  getHomePage,
  getNavigation,
  getPageBySlug,
  getRecentSupplies,
  getSiteSettings,
} from "./content";

vi.mock("./client", () => ({
  directusRequest: vi.fn(),
}));

const requestMock = vi.mocked(directusRequest);

describe("content queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps site settings without exposing raw Directus field names", async () => {
    requestMock.mockResolvedValue({
      company_name: "DEERE-SHOP",
      phone: "+7 900 000-00-00",
      email: "info@example.test",
      address: "Санкт-Петербург",
      working_hours: "Пн–Пт 09:00–18:00",
      logo: { id: "logo-id" },
      primary_color: "#174d34",
      accent_color: "#f1c232",
      primary_cta_text: "Получить консультацию",
      primary_cta_url: "/contacts",
      footer_text: "Поставка комплектующих",
      messengers: [],
      legal_name: "ООО «СМ ТЕХНО»",
      vat_info: "Работаем с НДС",
      requisites_url: "/documents/requisites.pdf",
      documents_url: "/documents",
      company_image: { id: "company-image" },
      city: "Санкт-Петербург",
      inn: "7812345678",
      kpp: "781201001",
      ogrn: "1027800000000",
      legal_address: "Санкт-Петербург, пример",
    });

    await expect(getSiteSettings()).resolves.toEqual(
      expect.objectContaining({
        companyName: "DEERE-SHOP",
        logoId: "logo-id",
        primaryCtaText: "Получить консультацию",
        legalName: "ООО «СМ ТЕХНО»",
        vatInfo: "Работаем с НДС",
        requisitesUrl: "/documents/requisites.pdf",
        documentsUrl: "/documents",
        companyImageId: "company-image",
        city: "Санкт-Петербург",
        inn: "7812345678",
        kpp: "781201001",
        ogrn: "1027800000000",
        legalAddress: "Санкт-Петербург, пример",
      }),
    );
  });

  it("uses the DEERE-SHOP fallback when the singleton has no brand name", async () => {
    requestMock.mockResolvedValue({
      company_name: null,
      phone: null,
      email: null,
      address: null,
      working_hours: null,
      logo: null,
      primary_color: null,
      accent_color: null,
      primary_cta_text: null,
      primary_cta_url: null,
      footer_text: null,
      messengers: null,
    });

    await expect(getSiteSettings()).resolves.toEqual(
      expect.objectContaining({
        companyName: "DEERE-SHOP",
        logoId: null,
      }),
    );
  });

  it("loads published navigation in editorial order", async () => {
    requestMock.mockResolvedValue([
      { id: "catalog", label: "Каталог", url: "/catalog" },
    ]);

    await getNavigation();

    const url = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    expect(url.searchParams.get("filter[status][_eq]")).toBe("published");
    expect(url.searchParams.get("sort")).toBe("sort_order");
  });

  it("maps the editable homepage singleton and linked published sections", async () => {
    requestMock
      .mockResolvedValueOnce({
        id: "singleton-home",
        status: "published",
        source_page: "home",
        h1: "Запчасти John Deere",
        hero_title: "Редактируемый hero",
        hero_text: "Текст из Directus",
        hero_image: { id: "cms-hero-image" },
        hero_image_alt: "Склад запчастей John Deere",
        hero_primary_button_text: "Оставить заявку",
        hero_primary_button_url: "#consultation",
        hero_secondary_button_text: null,
        hero_secondary_button_url: null,
        hero_search_label: "Поиск по каталогу",
        hero_search_placeholder: "Артикул или название",
        hero_search_button_text: "Найти",
        hero_bulk_prompt: "Несколько позиций?",
        hero_bulk_link_text: "Вставить список",
        hero_bulk_link_url: "/parts-request",
        hero_excel_link_text: "Загрузить Excel",
        hero_excel_link_url: "/parts-request?mode=excel",
        hero_photo_link_text: "Отправить фото",
        hero_photo_link_url: "/parts-request?mode=photo",
        seo_title: "Каталог запчастей",
        seo_description: "Описание",
        canonical_url: "/",
        og_title: null,
        og_description: null,
        og_image: null,
        is_indexable: true,
      })
      .mockResolvedValueOnce([
        {
          id: "categories",
          section_type: "categories",
          title: "Категории",
          subtitle: null,
          text: null,
          image: null,
          image_alt: null,
          button_text: null,
          button_url: null,
          items: [],
          settings: {},
          sort_order: 10,
          is_visible: true,
        },
      ]);

    const page = await getHomePage();

    expect(requestMock.mock.calls[0][0]).toContain("/items/home_page?");
    expect(page).toEqual(expect.objectContaining({
      id: "home",
      h1: "Запчасти John Deere",
      seoTitle: "Каталог запчастей",
    }));
    expect(page?.sections[0]).toEqual(expect.objectContaining({
      type: "hero",
      title: "Редактируемый hero",
      text: "Текст из Directus",
      imageId: "cms-hero-image",
      imageAlt: "Склад запчастей John Deere",
    }));
    expect(page?.sections[1]).toEqual(expect.objectContaining({ type: "categories" }));
    expect(requestMock.mock.calls[0][1]).toEqual({
      next: { revalidate: 300, tags: ["homepage"] },
    });
  });

  it("rejects published homepage data without complete hero content", async () => {
    requestMock.mockResolvedValueOnce({
      id: "singleton-home",
      status: "published",
      source_page: "home",
      h1: "Главная",
      hero_title: "",
      hero_text: "Описание",
      hero_image: null,
      hero_image_alt: "",
    });

    await expect(getHomePage()).rejects.toThrow("Invalid homepage hero content");
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("loads FAQ items scoped to a page", async () => {
    requestMock.mockResolvedValue([
      {
        id: "faq-1",
        question: "Как отправить запрос?",
        answer: "Через форму.",
      },
    ]);

    const items = await getFaqItems({ pageId: "home" });

    expect(items[0]).toEqual({
      id: "faq-1",
      question: "Как отправить запрос?",
      answer: "Через форму.",
    });
    const url = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    expect(url.searchParams.get("filter[page][_eq]")).toBe("home");
  });

  it("loads only published recent supplies in editorial order", async () => {
    requestMock.mockResolvedValue([{
      id: "empty",
      image: null,
      image_alt: null,
      equipment_type: null,
      positions: [],
      region: null,
      delivery_term: null,
      supply_format: null,
      supplied_at: null,
    }]);

    await expect(getRecentSupplies()).resolves.toEqual([]);

    const url = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    expect(url.searchParams.get("filter[status][_eq]")).toBe("published");
    expect(url.searchParams.get("sort")).toBe("-supplied_at,sort_order");
  });

  it("loads an informational page and safely skips unknown section types", async () => {
    requestMock
      .mockResolvedValueOnce([
        {
          id: "about",
          title: "О компании",
          slug: "about",
          h1: "О компании",
          seo_title: null,
          seo_description: null,
          seo_text: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "unknown",
          section_type: "unsupported",
          title: "Не показывать",
          subtitle: null,
          text: null,
          image: null,
          button_text: null,
          button_url: null,
          items: [],
          settings: {},
          sort_order: 1,
          is_visible: true,
        },
      ]);

    await expect(getPageBySlug("about")).resolves.toEqual(
      expect.objectContaining({ slug: "about", sections: [] }),
    );
  });

  it("loads normalized contact records", async () => {
    requestMock.mockResolvedValueOnce([
      {
        id: "phone",
        channel_type: "phone",
        label: "Телефон",
        value: "+7 900 000-00-00",
        url: "tel:+79000000000",
        icon: "phone",
      },
    ]);

    await expect(getContacts()).resolves.toHaveLength(1);
  });
});
