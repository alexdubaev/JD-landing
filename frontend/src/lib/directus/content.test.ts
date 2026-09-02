import { beforeEach, describe, expect, it, vi } from "vitest";

import { directusRequest, directusVersionedRequest, readPreviewContext } from "./client";
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
  directusVersionedRequest: vi.fn(),
  readPreviewContext: vi.fn(),
}));

const requestMock = vi.mocked(directusRequest);
const versionedRequestMock = vi.mocked(directusVersionedRequest);
const readPreviewContextMock = vi.mocked(readPreviewContext);

describe("content queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readPreviewContextMock.mockResolvedValue(null);
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
      yandex_metrica_id: "cms-counter-id",
      gtm_id: null,
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
        yandexMetricaId: "cms-counter-id",
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
        seo: null,
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

  it("retries the homepage without optional plugin SEO when that field is forbidden", async () => {
    requestMock.mockImplementation((path) => {
      const url = new URL(path, "https://cms.test");
      if (url.pathname === "/items/home_page" && url.searchParams.get("fields")?.split(",").includes("seo")) {
        return Promise.reject(Object.assign(new Error("Forbidden"), { status: 403 }));
      }
      if (url.pathname === "/items/home_page") {
        return Promise.resolve({
        id: "singleton-home",
        status: "published",
        source_page: "home",
        h1: "Запчасти John Deere",
        hero_title: "Редактируемый hero",
        hero_text: "Текст из Directus",
        hero_image: { id: "cms-hero-image" },
        hero_image_alt: "Склад запчастей John Deere",
        seo_title: "Каталог запчастей",
        seo_description: "Описание",
        });
      }
      return Promise.resolve([]);
    });

    await expect(getHomePage()).resolves.toEqual(
      expect.objectContaining({ h1: "Запчасти John Deere" }),
    );

    const firstUrl = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    const fallbackUrl = new URL(requestMock.mock.calls[1][0], "https://cms.test");
    expect(firstUrl.searchParams.get("fields")?.split(",")).toContain("seo");
    expect(fallbackUrl.searchParams.get("fields")?.split(",")).not.toContain("seo");
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
          seo: null,
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

  it("maps a scalar-only page exactly as before the dual-read and requests seo", async () => {
    requestMock
      .mockResolvedValueOnce([
        {
          id: "about",
          title: "О компании",
          slug: "about",
          h1: "О компании",
          seo_title: "О компании — скалярный заголовок",
          seo_description: "Скалярное описание",
          seo_text: null,
          seo: null,
        },
      ])
      .mockResolvedValueOnce([]);

    const page = await getPageBySlug("about");

    // The R11 production-safety property: with seo = null the mapped SEO
    // output is byte-identical to the pre-dual-read scalar mapping.
    expect(page).toEqual(
      expect.objectContaining({
        seoTitle: "О компании — скалярный заголовок",
        seoDescription: "Скалярное описание",
        seo: null,
      }),
    );
    const url = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    expect(url.searchParams.get("fields")).toContain("seo");
  });

  it("lets the plugin JSON win for an informational page", async () => {
    requestMock
      .mockResolvedValueOnce([
        {
          id: "about",
          title: "О компании",
          slug: "about",
          h1: "О компании",
          seo_title: "Скалярный заголовок",
          seo_description: "Скалярное описание",
          seo_text: null,
          seo: {
            title: "JSON-заголовок",
            meta_description: "JSON-описание",
          },
        },
      ])
      .mockResolvedValueOnce([]);

    const page = await getPageBySlug("about");

    expect(page).toEqual(
      expect.objectContaining({
        seoTitle: "JSON-заголовок",
        seoDescription: "JSON-описание",
        seo: { title: "JSON-заголовок", meta_description: "JSON-описание" },
      }),
    );
  });

  it("lets the plugin JSON win for the homepage singleton", async () => {
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
        hero_primary_button_text: null,
        hero_primary_button_url: null,
        hero_secondary_button_text: null,
        hero_secondary_button_url: null,
        hero_search_label: null,
        hero_search_placeholder: null,
        hero_search_button_text: null,
        hero_bulk_prompt: null,
        hero_bulk_link_text: null,
        hero_bulk_link_url: null,
        hero_excel_link_text: null,
        hero_excel_link_url: null,
        hero_photo_link_text: null,
        hero_photo_link_url: null,
        seo_title: "Скалярный заголовок",
        seo_description: "Скалярное описание",
        seo: { title: "JSON-заголовок главной" },
      })
      .mockResolvedValueOnce([]);

    const page = await getHomePage();

    expect(page).toEqual(
      expect.objectContaining({
        seoTitle: "JSON-заголовок главной",
        // Per-key fallback: no meta_description in the JSON.
        seoDescription: "Скалярное описание",
        seo: { title: "JSON-заголовок главной" },
      }),
    );
    // The singleton query now also requests the additive seo field.
    const url = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    expect(url.searchParams.get("fields")).toContain("seo");
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

const pagesPreviewContext = {
  collection: "pages" as const,
  id: "0c1d4b8e-6f7a-4b0c-9f55-3b2a87c90000",
  version: "6b1e8d64-9c2f-4a57-b1e3-2f0f68a1f000",
  versionKey: "r12-draft",
};

const homePreviewContext = {
  collection: "home_page" as const,
  id: "0c1d4b8e-6f7a-4b0c-9f55-3b2a87c90000",
  version: "6b1e8d64-9c2f-4a57-b1e3-2f0f68a1f000",
  versionKey: "r12-draft",
};

const rawPreviewHomePage = {
  id: "singleton-home",
  status: "draft",
  source_page: "home",
  h1: "Черновик главной",
  hero_title: "Hero из версии",
  hero_text: "Текст черновика",
  hero_image: { id: "draft-hero-image" },
  hero_image_alt: "Черновик alt",
  hero_primary_button_text: null,
  hero_primary_button_url: null,
  hero_secondary_button_text: null,
  hero_secondary_button_url: null,
  hero_search_label: null,
  hero_search_placeholder: null,
  hero_search_button_text: null,
  hero_bulk_prompt: null,
  hero_bulk_link_text: null,
  hero_bulk_link_url: null,
  hero_excel_link_text: null,
  hero_excel_link_url: null,
  hero_photo_link_text: null,
  hero_photo_link_url: null,
  seo_title: null,
  seo_description: null,
  seo: null,
};

describe("content version preview reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readPreviewContextMock.mockResolvedValue(null);
  });

  it("reads the page through its version overlay when the draft context matches", async () => {
    readPreviewContextMock.mockResolvedValue(pagesPreviewContext);
    versionedRequestMock.mockResolvedValue({
      id: "about",
      title: "О компании (черновик)",
      slug: "about",
      h1: "О компании (черновик)",
      seo_title: null,
      seo_description: null,
      seo_text: null,
      seo: null,
    });
    requestMock.mockResolvedValueOnce([]);

    const page = await getPageBySlug("about");

    expect(versionedRequestMock.mock.calls[0][0]).toContain(
      `/items/pages/${pagesPreviewContext.id}?`,
    );
    expect(versionedRequestMock.mock.calls[0][1]).toEqual({
      version: pagesPreviewContext.versionKey,
    });
    expect(page).toEqual(
      expect.objectContaining({ title: "О компании (черновик)" }),
    );
    // Sections stay on the published fetch.
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock.mock.calls[0][0]).toContain("/items/page_sections?");
  });

  it("falls back to the published page when the version slug does not match the URL", async () => {
    readPreviewContextMock.mockResolvedValue(pagesPreviewContext);
    versionedRequestMock.mockResolvedValue({
      id: "delivery",
      title: "Доставка",
      slug: "delivery",
      h1: "Доставка",
      seo_title: null,
      seo_description: null,
      seo_text: null,
      seo: null,
    });
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
          seo: null,
        },
      ])
      .mockResolvedValueOnce([]);

    const page = await getPageBySlug("about");

    expect(page).toEqual(expect.objectContaining({ title: "О компании" }));
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the published page fetch byte-identical without a preview context", async () => {
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
          seo: null,
        },
      ])
      .mockResolvedValueOnce([]);

    await getPageBySlug("about");

    expect(versionedRequestMock).not.toHaveBeenCalled();
    const expectedQuery = new URLSearchParams({
      "filter[status][_eq]": "published",
      "filter[slug][_eq]": "about",
      fields: "id,title,slug,h1,seo_title,seo_description,seo_text,seo",
      limit: "1",
    }).toString();
    expect(requestMock.mock.calls[0]).toEqual([
      `/items/pages?${expectedQuery}`,
      { next: { revalidate: 300, tags: ["pages", "page:about"] } },
    ]);
  });

  it("reads the homepage singleton through its version overlay, even in draft status", async () => {
    readPreviewContextMock.mockResolvedValue(homePreviewContext);
    versionedRequestMock.mockResolvedValue(rawPreviewHomePage);
    requestMock.mockResolvedValueOnce([]);

    const page = await getHomePage();

    expect(versionedRequestMock.mock.calls[0][0]).toContain("/items/home_page?");
    expect(versionedRequestMock.mock.calls[0][1]).toEqual({
      version: homePreviewContext.versionKey,
    });
    expect(page).toEqual(
      expect.objectContaining({
        h1: "Черновик главной",
        sections: expect.arrayContaining([
          expect.objectContaining({
            type: "hero",
            title: "Hero из версии",
            imageId: "draft-hero-image",
          }),
        ]),
      }),
    );
  });

  it("keeps the published homepage fetch byte-identical without a preview context", async () => {
    requestMock
      .mockResolvedValueOnce({
        id: "singleton-home",
        status: "published",
        source_page: "home",
        h1: "Главная",
        hero_title: "Hero",
        hero_text: "Текст",
        hero_image: "hero-file",
        hero_image_alt: "Alt",
      })
      .mockResolvedValueOnce([]);

    await getHomePage();

    expect(versionedRequestMock).not.toHaveBeenCalled();
    expect(requestMock.mock.calls[0][1]).toEqual({
      next: { revalidate: 300, tags: ["homepage"] },
    });
    const url = new URL(requestMock.mock.calls[0][0], "https://cms.test");
    expect(url.pathname).toBe("/items/home_page");
    expect(url.searchParams.has("version")).toBe(false);
  });
});
