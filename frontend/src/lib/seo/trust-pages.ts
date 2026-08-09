import type { ContentPage, PageSection } from "@/types/content";

type TrustPageMetadata = {
  title: string;
  description: string;
};

type TrustPage = {
  metadata: TrustPageMetadata;
  page: ContentPage;
};

const section = (
  id: string,
  title: string,
  text: string,
): PageSection => ({
  id,
  type: "seo_text",
  title,
  subtitle: null,
  text,
  imageId: null,
  buttonText: null,
  buttonUrl: null,
  items: [],
  settings: {},
  sortOrder: 0,
});

const trustPages: Record<string, TrustPage> = {
  about: {
    metadata: {
      title: "О компании — DEERE-SHOP",
      description:
        "DEERE-SHOP — независимый каталог запчастей и комплектующих John Deere. Помогаем подготовить запрос на подбор по артикулу, модели или маркировке.",
    },
    page: {
      id: "frontend-about",
      title: "О компании",
      slug: "about",
      h1: "О компании DEERE-SHOP",
      seoTitle: null,
      seoDescription: null,
      seoText: null,
      sections: [
        section(
          "about-purpose",
          "Чем занимается DEERE-SHOP",
          "DEERE-SHOP — независимый каталог продукции John Deere. Для подготовки запроса можно указать артикул, модель техники, маркировку детали или приложить фотографию.",
        ),
        section(
          "about-selection",
          "Как проходит подбор",
          "Менеджер уточняет исходные данные по запросу. Совместимость, комплектация, стоимость и условия поставки подтверждаются до оформления заказа.",
        ),
      ],
    },
  },
  delivery: {
    metadata: {
      title: "Доставка запчастей John Deere — DEERE-SHOP",
      description:
        "Доставка запчастей и комплектующих John Deere: условия, доступные способы и сроки уточняются после проверки состава заказа и адреса получателя.",
    },
    page: {
      id: "frontend-delivery",
      title: "Доставка",
      slug: "delivery",
      h1: "Доставка запчастей John Deere",
      seoTitle: null,
      seoDescription: null,
      seoText: null,
      sections: [
        section(
          "delivery-conditions",
          "Условия поставки",
          "Способ доставки, срок и стоимость зависят от состава запроса и адреса получателя. Эти условия подтверждаются менеджером после проверки заказа.",
        ),
        section(
          "delivery-request",
          "Что указать в запросе",
          "Для подбора укажите артикул, модель техники или маркировку детали. Если данных недостаточно, приложите фотографию — это поможет уточнить запрос.",
        ),
      ],
    },
  },
  contacts: {
    metadata: {
      title: "Контакты — DEERE-SHOP",
      description:
        "Контакты DEERE-SHOP для запроса по запчастям John Deere. Оставьте заявку с артикулом, моделью техники или фотографией маркировки детали.",
    },
    page: {
      id: "frontend-contacts",
      title: "Контакты",
      slug: "contacts",
      h1: "Контакты DEERE-SHOP",
      seoTitle: null,
      seoDescription: null,
      seoText: null,
      sections: [
        {
          ...section(
            "contacts-channels",
            "Свяжитесь с нами",
            "Используйте телефон, электронную почту или форму на сайте. Чтобы получить предметный ответ, добавьте артикул, модель техники или фото маркировки детали.",
          ),
          type: "contacts",
        },
      ],
    },
  },
  "privacy-policy": {
    metadata: {
      title: "Политика конфиденциальности — DEERE-SHOP",
      description:
        "Политика конфиденциальности DEERE-SHOP: правила обработки персональных данных, передаваемых пользователем через формы обратной связи на сайте.",
    },
    page: {
      id: "frontend-privacy-policy",
      title: "Политика конфиденциальности",
      slug: "privacy-policy",
      h1: "Политика конфиденциальности",
      seoTitle: null,
      seoDescription: null,
      seoText: null,
      sections: [
        section(
          "privacy-purpose",
          "Обработка обращений",
          "Данные, которые пользователь передаёт через формы сайта, используются для обработки обращения и обратной связи по запросу.",
        ),
        section(
          "privacy-contact",
          "Как задать вопрос",
          "По вопросам обработки персональных данных воспользуйтесь контактами, указанными на сайте.",
        ),
      ],
    },
  },
};

export function getTrustPageFallback(slug: string): ContentPage | null {
  return trustPages[slug]?.page ?? null;
}

export function getTrustPageMetadata(
  slug: string,
): TrustPageMetadata | null {
  return trustPages[slug]?.metadata ?? null;
}
