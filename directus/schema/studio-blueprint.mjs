const group = (label, sort, options = {}) => ({
  label,
  interface: options.interface ?? "group-accordion",
  sort,
  ...(options.closed ? { options: { start: "closed" } } : {}),
});

const input = (label, groupName, sort, options = {}) => ({
  label,
  group: groupName,
  sort,
  width: options.width ?? "full",
  ...(options.note ? { note: options.note } : {}),
  ...(options.interface ? { interface: options.interface } : {}),
  ...(options.options ? { options: options.options } : {}),
  ...(options.hidden !== undefined ? { hidden: options.hidden } : {}),
  ...(options.readonly !== undefined ? { readonly: options.readonly } : {}),
});

const repeater = (template, fields) => ({
  interface: "list",
  options: { template, fields },
});

const collections = {
  site_settings: { label: "Настройки сайта", group: "group_settings", icon: "settings", sort: 1, hidden: false, singleton: true },
  home_page: { label: "Главная страница", group: "group_site", icon: "home", sort: 1, hidden: false, singleton: true },
  pages: { label: "Страницы", group: "group_site", icon: "web", sort: 2, hidden: false, displayTemplate: "{{title}} · /{{slug}} · {{status}}" },
  navigation_items: { label: "Меню", group: "group_site", icon: "menu", sort: 3, hidden: false, displayTemplate: "{{label}} · {{location}}" },
  products: { label: "Товары", group: "group_catalog", icon: "inventory_2", sort: 1, hidden: false, displayTemplate: "{{title}} · {{sku}} · {{availability_status}}" },
  categories: { label: "Категории", group: "group_catalog", icon: "category", sort: 2, hidden: false, displayTemplate: "{{title}} · /{{slug}}" },
  articles: { label: "Статьи", group: "group_content", icon: "article", sort: 1, hidden: false, displayTemplate: "{{title}} · {{status}}" },
  faq_items: { label: "Вопросы и ответы", group: "group_content", icon: "quiz", sort: 2, hidden: false, displayTemplate: "{{question}} · {{status}}" },
  recent_supplies: { label: "Недавние поставки", group: "group_content", icon: "local_shipping", sort: 3, hidden: false, displayTemplate: "{{equipment_type}} · {{region}} · {{status}}" },
  leads: { label: "Заявки", group: "group_sales", icon: "inbox", sort: 1, hidden: false, displayTemplate: "{{name}} · {{phone}} · {{status}} · {{created_at}}" },
  orders: { label: "Заказы", group: "group_sales", icon: "shopping_cart", sort: 2, hidden: false, displayTemplate: "{{customer_name}} · {{total}} · {{status}} · {{created_at}}" },
  page_sections: { label: "Секции страниц", hidden: true, icon: "view_quilt" },
  product_images: { label: "Изображения товаров", hidden: true, icon: "photo_library" },
  product_specifications: { label: "Характеристики товаров", hidden: true, icon: "table_chart" },
  product_documents: { label: "Документы товаров", hidden: true, icon: "description" },
  order_items: { label: "Позиции заказов", hidden: true, icon: "list_alt" },
  contact_channels: { label: "Каналы связи", hidden: true, icon: "contact_phone" },
  hero_blocks: { label: "Первый экран — архив", hidden: true, icon: "view_carousel" },
  advantages: { label: "Преимущества — архив", hidden: true, icon: "verified" },
  cta_blocks: { label: "Призывы к действию — архив", hidden: true, icon: "ads_click" },
  seo_text_blocks: { label: "SEO-тексты — архив", hidden: true, icon: "text_snippet" },
  banners: { label: "Баннеры — архив", hidden: true, icon: "campaign" },
  testimonials: { label: "Отзывы — архив", hidden: true, icon: "format_quote" },
  lead_forms: { label: "Настройки форм", hidden: true, icon: "dynamic_form" },
  seo_redirects: { label: "SEO-редиректы", hidden: true, icon: "route" },
};

const homepageGroups = {
  group_main: group("Основное", 1, { interface: "group-detail" }),
  group_hero: group("Первый экран", 2, { interface: "group-detail" }),
  group_sections: group("Секции главной", 3, { interface: "group-detail" }),
  group_seo: group("SEO", 4, { closed: true }),
  group_system: group("Служебное", 5, { closed: true }),
};

const homepageFields = {
  status: input("Статус публикации", "group_main", 1, { width: "half" }),
  h1: input("Заголовок H1", "group_main", 2, { note: "Единственный H1 главной страницы." }),
  hero_title: input("Заголовок первого экрана", "group_hero", 1, { note: "Главный заголовок, который посетитель видит первым." }),
  hero_text: input("Описание первого экрана", "group_hero", 2),
  hero_image: input("Изображение первого экрана", "group_hero", 3, { interface: "file-image" }),
  hero_image_alt: input("Alt-текст изображения", "group_hero", 4, { note: "Кратко опишите содержимое изображения для доступности и SEO." }),
  hero_primary_button_text: input("Текст основной кнопки", "group_hero", 5, { width: "half" }),
  hero_primary_button_url: input("Ссылка основной кнопки", "group_hero", 6, { width: "half" }),
  hero_secondary_button_text: input("Текст дополнительной кнопки", "group_hero", 7, { width: "half" }),
  hero_secondary_button_url: input("Ссылка дополнительной кнопки", "group_hero", 8, { width: "half" }),
  hero_search_label: input("Название поиска для озвучивания", "group_hero", 9, { width: "half" }),
  hero_search_placeholder: input("Подсказка в строке поиска", "group_hero", 10, { width: "half" }),
  hero_search_button_text: input("Текст кнопки поиска", "group_hero", 11, { width: "half" }),
  hero_bulk_prompt: input("Подпись группового запроса", "group_hero", 12, { width: "half" }),
  hero_bulk_link_text: input("Текст ссылки «Список»", "group_hero", 13, { width: "half" }),
  hero_bulk_link_url: input("Ссылка «Список»", "group_hero", 14, { width: "half" }),
  hero_excel_link_text: input("Текст ссылки «Excel»", "group_hero", 15, { width: "half" }),
  hero_excel_link_url: input("Ссылка «Excel»", "group_hero", 16, { width: "half" }),
  hero_photo_link_text: input("Текст ссылки «Фото»", "group_hero", 17, { width: "half" }),
  hero_photo_link_url: input("Ссылка «Фото»", "group_hero", 18, { width: "half" }),
  sections: input("Секции главной страницы", "group_sections", 1, {
    interface: "list-o2m",
    options: { template: "{{section_type}} · {{title}}", enableCreate: true, enableSelect: false },
    note: "Откройте секцию, чтобы изменить текст, видимость и порядок.",
  }),
  seo_title: input("SEO-заголовок", "group_seo", 1, { note: "Рекомендуемая длина — до 60 символов." }),
  seo_description: input("SEO-описание", "group_seo", 2, { note: "Рекомендуемая длина — 130–160 символов." }),
  canonical_url: input("Канонический URL", "group_seo", 3),
  og_title: input("Заголовок Open Graph", "group_seo", 4),
  og_description: input("Описание Open Graph", "group_seo", 5),
  og_image: input("Изображение Open Graph", "group_seo", 6, { interface: "file-image" }),
  is_indexable: input("Разрешить индексацию", "group_seo", 7, { width: "half" }),
  source_page: input("Связанная системная страница", "group_system", 1, { readonly: true }),
  translations: input("Переводы", "group_system", 2, { hidden: true }),
  created_at: input("Создано", "group_system", 3, { width: "half", readonly: true }),
  updated_at: input("Обновлено", "group_system", 4, { width: "half", readonly: true }),
  id: input("Идентификатор", "group_system", 5, { hidden: true, readonly: true }),
};

const specificationRepeater = repeater("{{name}}: {{value}} {{unit}}", [
  { field: "name", name: "Название", type: "string", meta: { interface: "input", width: "half", required: true } },
  { field: "value", name: "Значение", type: "string", meta: { interface: "input", width: "half", required: true } },
  { field: "unit", name: "Единица", type: "string", meta: { interface: "input", width: "half" } },
]);

const galleryRepeater = repeater("{{alt_text}}", [
  { field: "image", name: "Изображение", type: "uuid", meta: { interface: "file-image", width: "full", required: true } },
  { field: "alt_text", name: "Alt-текст", type: "string", meta: { interface: "input", width: "full" } },
  { field: "sort_order", name: "Порядок", type: "integer", meta: { interface: "input", width: "half" } },
]);

const documentRepeater = repeater("{{title}}", [
  { field: "title", name: "Название", type: "string", meta: { interface: "input", width: "half", required: true } },
  { field: "file", name: "Файл", type: "uuid", meta: { interface: "file", width: "half", required: true } },
]);

const messengerRepeater = repeater("{{label}} · {{url}}", [
  { field: "label", name: "Название", type: "string", meta: { interface: "input", width: "half", required: true } },
  { field: "url", name: "Ссылка", type: "string", meta: { interface: "input", width: "half", required: true } },
  { field: "icon", name: "Иконка", type: "string", meta: { interface: "input", width: "half" } },
]);

const sectionItemRepeater = repeater("{{title}}", [
  { field: "title", name: "Заголовок", type: "string", meta: { interface: "input", width: "full" } },
  { field: "text", name: "Текст", type: "text", meta: { interface: "input-multiline", width: "full" } },
  { field: "icon", name: "Иконка", type: "string", meta: { interface: "input", width: "half" } },
  { field: "url", name: "Ссылка", type: "string", meta: { interface: "input", width: "half" } },
]);

export const studioBlueprint = {
  defaultLanguage: "ru-RU",
  folders: {
    group_site: { label: "Сайт", icon: "web", sort: 1 },
    group_catalog: { label: "Каталог", icon: "inventory_2", sort: 2 },
    group_content: { label: "Контент", icon: "article", sort: 3 },
    group_sales: { label: "Продажи", icon: "request_quote", sort: 4 },
    group_settings: { label: "Настройки", icon: "settings", sort: 5 },
  },
  collections,
  fields: {
    home_page: { groups: homepageGroups, fields: homepageFields },
    products: {
      groups: {
        group_main: group("Основное", 1, { interface: "group-detail" }),
        group_media: group("Изображения и документы", 2),
        group_specs: group("Характеристики", 3),
        group_sales: group("Цена и наличие", 4),
        group_seo: group("SEO", 5, { closed: true }),
        group_system: group("Служебное", 6, { closed: true }),
      },
      fields: {
        title: input("Название товара", "group_main", 1),
        sku: input("Артикул", "group_main", 2, { width: "half" }),
        category: input("Категория", "group_main", 3, { width: "half" }),
        short_description: input("Краткое описание", "group_main", 4),
        full_description: input("Полное описание", "group_main", 5),
        main_image: input("Основное изображение", "group_media", 1, { interface: "file-image" }),
        image_alt: input("Alt-текст основного изображения", "group_media", 2),
        gallery: input("Галерея", "group_media", 3, galleryRepeater),
        documents: input("Документы", "group_media", 4, documentRepeater),
        specifications: input("Характеристики", "group_specs", 1, specificationRepeater),
        price: input("Цена", "group_sales", 1, { width: "half" }),
        currency: input("Валюта", "group_sales", 2, { width: "half" }),
        price_status: input("Статус цены", "group_sales", 3, { width: "half" }),
        availability_status: input("Наличие", "group_sales", 4, { width: "half" }),
        seo_title: input("SEO-заголовок", "group_seo", 1),
        seo_description: input("SEO-описание", "group_seo", 2),
        seo_text: input("SEO-текст", "group_seo", 3),
        og_image: input("Изображение Open Graph", "group_seo", 4, { interface: "file-image" }),
        id: input("Идентификатор", "group_system", 1, { hidden: true, readonly: true }),
        translations: input("Переводы", "group_system", 2, { hidden: true }),
        created_at: input("Создано", "group_system", 3, { width: "half", readonly: true }),
        updated_at: input("Обновлено", "group_system", 4, { width: "half", readonly: true }),
      },
    },
    site_settings: {
      groups: {
        group_company: group("Компания", 1, { interface: "group-detail" }),
        group_contacts: group("Контакты", 2, { interface: "group-detail" }),
        group_brand: group("Оформление", 3),
        group_footer: group("Подвал и документы", 4),
        group_seo: group("SEO по умолчанию", 5, { closed: true }),
        group_analytics: group("Аналитика", 6, { closed: true }),
        group_system: group("Служебное", 7, { closed: true }),
      },
      fields: {
        company_name: input("Название компании", "group_company", 1),
        legal_name: input("Юридическое название", "group_company", 2),
        phone: input("Телефон", "group_contacts", 1, { width: "half" }),
        email: input("Email", "group_contacts", 2, { width: "half" }),
        address: input("Адрес", "group_contacts", 3),
        working_hours: input("Часы работы", "group_contacts", 4),
        messengers: input("Мессенджеры", "group_contacts", 5, messengerRepeater),
        logo: input("Логотип", "group_brand", 1, { interface: "file-image" }),
        favicon: input("Favicon", "group_brand", 2, { interface: "file-image" }),
        footer_text: input("Текст подвала", "group_footer", 1),
        footer_disclaimer: input("Примечание в подвале", "group_footer", 2),
        seo_title: input("SEO-заголовок по умолчанию", "group_seo", 1),
        seo_description: input("SEO-описание по умолчанию", "group_seo", 2),
        yandex_metrica_id: input("ID Яндекс Метрики", "group_analytics", 1, { width: "half" }),
        gtm_id: input("ID Google Tag Manager", "group_analytics", 2, { width: "half" }),
        id: input("Идентификатор", "group_system", 1, { hidden: true, readonly: true }),
        translations: input("Переводы", "group_system", 2, { hidden: true }),
      },
    },
    page_sections: {
      groups: {
        group_main: group("Основное", 1, { interface: "group-detail" }),
        group_content: group("Контент", 2, { interface: "group-detail" }),
        group_items: group("Элементы", 3),
        group_button: group("Кнопка", 4),
        group_system: group("Служебное", 5, { closed: true }),
      },
      fields: {
        status: input("Статус", "group_main", 1, { width: "half" }),
        section_type: input("Тип секции", "group_main", 2, { width: "half" }),
        is_visible: input("Показывать", "group_main", 3, { width: "half" }),
        sort_order: input("Порядок", "group_main", 4, { width: "half" }),
        title: input("Заголовок", "group_content", 1),
        subtitle: input("Подзаголовок", "group_content", 2),
        text: input("Текст", "group_content", 3),
        image: input("Изображение", "group_content", 4, { interface: "file-image" }),
        image_alt: input("Alt-текст", "group_content", 5),
        items: input("Элементы секции", "group_items", 1, sectionItemRepeater),
        button_text: input("Текст кнопки", "group_button", 1, { width: "half" }),
        button_url: input("Ссылка кнопки", "group_button", 2, { width: "half" }),
        settings: input("Дополнительные параметры", "group_system", 1, { hidden: true }),
        page: input("Страница", "group_system", 2, { readonly: true }),
        home_page: input("Главная страница", "group_system", 3, { readonly: true }),
        id: input("Идентификатор", "group_system", 4, { hidden: true, readonly: true }),
        translations: input("Переводы", "group_system", 5, { hidden: true }),
      },
    },
  },
};
