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
  ...(options.display ? { display: options.display } : {}),
  ...(options.options ? { options: options.options } : {}),
  ...(options.hidden !== undefined ? { hidden: options.hidden } : {}),
  ...(options.readonly !== undefined ? { readonly: options.readonly } : {}),
});

/**
 * R11 SEO-plugin panel (@directus-labs/seo-plugin 1.1.1): the JSON-first
 * editing surface next to the legacy scalar fields. The scalars stay editable
 * in the same group — they remain the frontend fallback and the migration
 * source until a separate cleanup release.
 */
const seoPluginInput = (sort) =>
  input("SEO-панель (плагин)", "group_seo", sort, {
    interface: "seo-interface",
    display: "seo-display",
    note: "Приоритетное JSON-поле SEO (R11). Пока JSON пуст, сайт читает скалярные поля ниже; миграция заполняет JSON из скаляров и никогда не изменяет их.",
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
  products: { label: "Товары", group: "group_catalog", icon: "inventory_2", sort: 1, hidden: false, displayTemplate: "{{title}} · {{sku}} · {{category.title}} · {{availability_status}}" },
  categories: { label: "Категории", group: "group_catalog", icon: "category", sort: 2, hidden: false, displayTemplate: "{{title}} · /{{slug}}" },
  product_codes: { label: "Коды товаров", group: "group_catalog", icon: "qr_code_2", sort: 3, hidden: false, displayTemplate: "{{code}} · {{code_type}} · {{product.sku}}" },
  products_analogs: { label: "Аналоги товаров", group: "group_catalog", icon: "compare_arrows", sort: 4, hidden: false, displayTemplate: "{{relation_type}} · {{product_from.sku}} → {{product_to.sku}}" },
  articles: { label: "Статьи", group: "group_content", icon: "article", sort: 1, hidden: false, displayTemplate: "{{title}} · {{status}}" },
  faq_items: { label: "Вопросы и ответы", group: "group_content", icon: "quiz", sort: 2, hidden: false, displayTemplate: "{{question}} · {{status}}" },
  recent_supplies: { label: "Недавние поставки", group: "group_content", icon: "local_shipping", sort: 3, hidden: false, displayTemplate: "{{equipment_type}} · {{region}} · {{status}}" },
  leads: { label: "Заявки", group: "group_sales", icon: "inbox", sort: 1, hidden: false, displayTemplate: "{{name}} · {{phone}} · {{status}} · {{created_at}}" },
  orders: { label: "Заказы", group: "group_sales", icon: "shopping_cart", sort: 2, hidden: false, displayTemplate: "{{customer_name}} · {{total}} · {{status}} · {{created_at}}" },
  seo_work_items: { label: "SEO-задачи", group: "group_seo", icon: "checklist", sort: 1, hidden: false, displayTemplate: "{{type}} · {{title}} · {{status}} · {{severity}}" },
  page_sections: { label: "Секции страниц", hidden: true, icon: "view_quilt" },
  articles_editor_nodes: { label: "Узлы редактора статей", hidden: true, icon: "account_tree" },
  product_images: { label: "Изображения товаров", hidden: true, icon: "photo_library" },
  product_specifications: { label: "Характеристики товаров", hidden: true, icon: "table_chart" },
  product_documents: { label: "Документы товаров", hidden: true, icon: "description" },
  order_items: { label: "Позиции заказов", hidden: true, icon: "list_alt" },
  contact_channels: { label: "Каналы связи", hidden: true, icon: "contact_phone" },
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
  seo: seoPluginInput(8),
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

const form = (groups, sections) => ({
  groups,
  fields: Object.fromEntries(
    Object.entries(sections).flatMap(([groupName, fields]) =>
      fields.map(([name, label, options = {}], index) => [
        name,
        input(label, groupName, index + 1, options),
      ]),
    ),
  ),
});

const standardSystemFields = [
  ["translations", "Переводы"],
  ["created_at", "Создано", { width: "half" }],
  ["updated_at", "Обновлено", { width: "half" }],
  ["id", "Идентификатор"],
];

const transactionalSystemFields = standardSystemFields.filter(
  ([name]) => name !== "translations",
);

const pagesForm = form(
  {
    group_main: group("Основное", 1, { interface: "group-detail" }),
    group_content: group("Содержимое страницы", 2, { interface: "group-detail" }),
    group_seo: group("SEO", 3, { closed: true }),
    group_system: group("Служебное", 4, { closed: true }),
  },
  {
    group_main: [
      ["status", "Статус", { width: "half" }],
      ["page_type", "Тип страницы", { width: "half" }],
      ["title", "Название страницы"],
      ["slug", "Адрес страницы", { note: "Часть URL без начального слеша." }],
    ],
    group_content: [
      ["h1", "Заголовок H1"],
      ["eyebrow", "Надзаголовок"],
      ["intro", "Вводный текст"],
      ["seo_text", "Основной текст"],
    ],
    group_seo: [
      ["seo_title", "SEO-заголовок"],
      ["seo_description", "SEO-описание"],
      ["og_image", "Изображение Open Graph"],
      ["canonical_url", "Канонический URL"],
      ["is_indexable", "Разрешить индексацию", { width: "half" }],
      ["seo", "SEO-панель (плагин)", {
        interface: "seo-interface",
        display: "seo-display",
        note: "Приоритетное JSON-поле SEO (R11). Пока JSON пуст, сайт читает скалярные поля выше; миграция заполняет JSON из скаляров и никогда не изменяет их.",
      }],
    ],
    group_system: standardSystemFields,
  },
);

const categoriesForm = form(
  {
    group_main: group("Основное", 1, { interface: "group-detail" }),
    group_content: group("Описание и оформление", 2, { interface: "group-detail" }),
    group_catalog: group("Каталог", 3),
    group_seo: group("SEO", 4, { closed: true }),
    group_system: group("Служебное", 5, { closed: true }),
  },
  {
    group_main: [
      ["status", "Статус", { width: "half" }],
      ["sort_order", "Порядок", { width: "half" }],
      ["title", "Название категории"],
      ["slug", "Адрес категории"],
      ["parent", "Родительская категория"],
      ["show_on_homepage", "Показывать на главной", { width: "half" }],
    ],
    group_content: [
      ["description", "Краткое описание"],
      ["image", "Основное изображение"],
      ["image_alt", "Alt-текст изображения"],
      ["icon", "Компактная иконка"],
      ["icon_alt", "Alt-текст иконки"],
    ],
    group_catalog: [
      ["h1", "Заголовок H1"],
      ["intro", "Вводный текст"],
      ["selection_guide", "Как выбрать"],
      ["internal_links", "Внутренние ссылки"],
      ["faq", "Связанные вопросы"],
    ],
    group_seo: [
      ["seo_title", "SEO-заголовок"],
      ["seo_description", "SEO-описание"],
      ["seo_text", "SEO-текст"],
      ["og_image", "Изображение Open Graph"],
      ["is_indexable", "Разрешить индексацию", { width: "half" }],
      ["seo", "SEO-панель (плагин)", {
        interface: "seo-interface",
        display: "seo-display",
        note: "Приоритетное JSON-поле SEO (R11). Пока JSON пуст, сайт читает скалярные поля выше; миграция заполняет JSON из скаляров и никогда не изменяет их.",
      }],
      ["redirect_target", "Цель перенаправления"],
    ],
    group_system: standardSystemFields,
  },
);

const articlesForm = form(
  {
    group_main: group("Публикация", 1, { interface: "group-detail" }),
    group_content: group("Материал", 2, { interface: "group-detail" }),
    group_relations: group("Связанные материалы", 3),
    group_seo: group("SEO", 4, { closed: true }),
    group_system: group("Служебное", 5, { closed: true }),
  },
  {
    group_main: [
      ["status", "Статус", { width: "half" }],
      ["published_at", "Дата публикации", { width: "half" }],
      ["title", "Название статьи"],
      ["slug", "Адрес статьи"],
      ["category_label", "Рубрика", { width: "half" }],
      ["reading_time_minutes", "Время чтения, мин", { width: "half" }],
      ["is_featured", "Рекомендуемая статья", { width: "half" }],
      ["sort_order", "Порядок", { width: "half" }],
    ],
    group_content: [
      ["excerpt", "Краткое описание"],
      ["content", "Текст статьи"],
      ["content_blocks", "Блочный редактор статьи", {
        interface: "flexible-editor",
        options: {
          m2aField: "editor_nodes",
          relationBlocks: ["products", "categories"],
          relationInlineBlocks: ["products", "categories"],
          relationMarks: ["products", "categories"],
          tools: [
            "paragraph",
            "h2",
            "h3",
            "h4",
            "bold",
            "italic",
            "strike",
            "underline",
            "code",
            "subscript",
            "superscript",
            "link",
            "removeLink",
            "autolink",
            "bulletList",
            "orderedList",
            "blockquote",
            "codeBlock",
            "table",
            "horizontalRule",
            "hardBreak",
            "textAlign",
            "undo",
            "redo",
          ],
        },
        note: "Структурный контент статьи. Поле «Текст статьи» (HTML) остаётся каноническим до перехода.",
      }],
      // The extension requires editor_nodes to live in the SAME group as the
      // flexible editor field, otherwise the M2A connection is lost.
      ["editor_nodes", "Узлы редактора (служебное)", { hidden: true }],
      ["cover_image", "Обложка"],
      ["image_alt", "Alt-текст обложки"],
      ["author", "Автор", { width: "half" }],
      ["reviewer", "Проверил", { width: "half" }],
      ["sources", "Источники"],
    ],
    group_relations: [
      ["related_categories", "Связанные категории"],
      ["related_products", "Связанные товары"],
    ],
    group_seo: [
      ["seo_title", "SEO-заголовок"],
      ["seo_description", "SEO-описание"],
      ["og_image", "Изображение Open Graph"],
      ["seo", "SEO-панель (плагин)", {
        interface: "seo-interface",
        display: "seo-display",
        note: "Приоритетное JSON-поле SEO (R11). Пока JSON пуст, сайт читает скалярные поля выше; миграция заполняет JSON из скаляров и никогда не изменяет их.",
      }],
    ],
    group_system: standardSystemFields,
  },
);

const faqForm = form(
  {
    group_main: group("Вопрос и ответ", 1, { interface: "group-detail" }),
    group_context: group("Где показывать", 2),
    group_system: group("Служебное", 3, { closed: true }),
  },
  {
    group_main: [
      ["status", "Статус", { width: "half" }],
      ["is_visible", "Показывать", { width: "half" }],
      ["question", "Вопрос"],
      ["answer", "Ответ"],
      ["sort_order", "Порядок", { width: "half" }],
    ],
    group_context: [
      ["page", "Страница"],
      ["category", "Категория"],
      ["product", "Товар"],
    ],
    group_system: standardSystemFields,
  },
);

const leadsForm = form(
  {
    group_contact: group("Контакт", 1, { interface: "group-detail" }),
    group_request: group("Запрос", 2, { interface: "group-detail" }),
    group_attribution: group("Источник обращения", 3, { closed: true }),
    group_consent: group("Согласие на рекламу", 4, { closed: true }),
    group_workflow: group("Работа с заявкой", 5),
    group_system: group("Служебное", 6, { closed: true }),
  },
  {
    group_contact: [
      ["name", "Имя"],
      ["phone", "Телефон", { width: "half" }],
      ["email", "Email", { width: "half" }],
    ],
    group_request: [
      ["message", "Сообщение"],
      ["product", "Товар"],
      ["category", "Категория"],
      ["lead_form", "Форма"],
      ["request_items", "Позиции запроса"],
      ["attachments", "Вложения"],
    ],
    group_attribution: [
      ["page_url", "Страница отправки"],
      ["utm_source", "UTM source", { width: "half" }],
      ["utm_medium", "UTM medium", { width: "half" }],
      ["utm_campaign", "UTM campaign", { width: "half" }],
      ["utm_content", "UTM content", { width: "half" }],
      ["utm_term", "UTM term", { width: "half" }],
    ],
    group_consent: [
      ["marketing_consent", "Согласие на рекламу", { width: "half", readonly: true }],
      ["marketing_consent_at", "Дата согласия", { width: "half", readonly: true }],
      ["marketing_consent_version", "Версия текста", { width: "half", readonly: true }],
    ],
    group_workflow: [
      ["status", "Статус", { width: "half" }],
      ["manager_comment", "Комментарий менеджера"],
    ],
    group_system: transactionalSystemFields,
  },
);

const ordersForm = form(
  {
    group_contact: group("Покупатель", 1, { interface: "group-detail" }),
    group_order: group("Заказ", 2, { interface: "group-detail" }),
    group_attribution: group("Источник заказа", 3, { closed: true }),
    group_consent: group("Согласие на рекламу", 4, { closed: true }),
    group_workflow: group("Обработка заказа", 5),
    group_system: group("Служебное", 6, { closed: true }),
  },
  {
    group_contact: [
      ["customer_name", "Имя покупателя"],
      ["phone", "Телефон", { width: "half" }],
      ["email", "Email", { width: "half" }],
    ],
    group_order: [
      ["comment", "Комментарий"],
      ["total", "Сумма", { width: "half" }],
      ["currency", "Валюта", { width: "half" }],
    ],
    group_attribution: [
      ["page_url", "Страница оформления"],
      ["utm_source", "UTM source", { width: "half" }],
      ["utm_medium", "UTM medium", { width: "half" }],
      ["utm_campaign", "UTM campaign", { width: "half" }],
      ["utm_content", "UTM content", { width: "half" }],
      ["utm_term", "UTM term", { width: "half" }],
    ],
    group_consent: [
      ["marketing_consent", "Согласие на рекламу", { width: "half", readonly: true }],
      ["marketing_consent_at", "Дата согласия", { width: "half", readonly: true }],
      ["marketing_consent_version", "Версия текста", { width: "half", readonly: true }],
    ],
    group_workflow: [
      ["status", "Статус", { width: "half" }],
      ["manager_comment", "Комментарий менеджера"],
    ],
    group_system: transactionalSystemFields,
  },
);

const seoWorkItemsForm = form(
  {
    group_main: group("Задача", 1, { interface: "group-detail" }),
    group_entity: group("Сущность", 2, { interface: "group-detail" }),
    group_recommendation: group("Рекомендация", 3, { interface: "group-detail" }),
    group_evidence: group("Обоснование и источники", 4, { closed: true }),
    group_pipeline: group("Конвейер и выполнение", 5, { closed: true }),
    group_system: group("Служебное", 6, { closed: true }),
  },
  {
    group_main: [
      ["type", "Тип задачи", { width: "half" }],
      ["subtype", "Подтип", { width: "half" }],
      ["status", "Статус", { width: "half" }],
      ["severity", "Критичность", { width: "half" }],
      ["priority_score", "Приоритет", { width: "half" }],
      ["confidence", "Уверенность", { width: "half" }],
      ["title", "Заголовок"],
      ["summary", "Краткое описание"],
    ],
    group_entity: [
      ["entity_type", "Тип сущности", { width: "half" }],
      ["entity_id", "ID сущности", { width: "half" }],
      ["entity_key", "Ключ сущности (slug/sku)", { width: "half" }],
      ["url", "URL страницы", { width: "half" }],
      ["article", "Статья (черновик)", { note: "Заполняется только после одобрения задачи; публикует человек, не воркер." }],
    ],
    group_recommendation: [
      ["recommendation", "Рекомендация"],
      ["current_value_json", "Текущее значение (JSON)"],
      ["proposed_value_json", "Предлагаемое значение (JSON)"],
      ["patch_json", "Патч полей (JSON)"],
    ],
    group_evidence: [
      ["evidence_json", "Обоснование (JSON)"],
      ["sources_json", "Источники (JSON)"],
      ["metrics_json", "Метрики (JSON)"],
    ],
    group_pipeline: [
      ["worker_run_id", "Прогон воркера", { width: "half" }],
      ["claimed_at", "Захвачено", { width: "half", readonly: true }],
      ["expires_at", "Захват истекает", { width: "half", readonly: true }],
      ["applied_at", "Применено", { width: "half", readonly: true }],
      ["rolled_back_at", "Откатено", { width: "half", readonly: true }],
      ["last_error", "Последняя ошибка", { readonly: true }],
    ],
    group_system: [
      ["dedupe_key", "Ключ дедупликации", { readonly: true, note: "Вычисляет воркер (sha256 сущность+тип+подтип+патч); уникален физически, через SQL-констрейнт." }],
      ["before_hash", "Хеш до изменения", { readonly: true }],
      ...transactionalSystemFields,
    ],
  },
);

export const studioBlueprint = {
  defaultLanguage: "ru-RU",
  folders: {
    group_site: { label: "Сайт", icon: "web", sort: 1 },
    group_catalog: { label: "Каталог", icon: "inventory_2", sort: 2 },
    group_content: { label: "Контент", icon: "article", sort: 3 },
    group_sales: { label: "Продажи", icon: "request_quote", sort: 4 },
    group_settings: { label: "Настройки", icon: "settings", sort: 5 },
    group_seo: { label: "SEO", icon: "travel_explore", sort: 6 },
  },
  collections,
  fields: {
    home_page: { groups: homepageGroups, fields: homepageFields },
    pages: pagesForm,
    categories: categoriesForm,
    articles: articlesForm,
    faq_items: faqForm,
    leads: leadsForm,
    orders: ordersForm,
    seo_work_items: seoWorkItemsForm,
    products: {
      groups: {
        group_main: group("Основное", 1, { interface: "group-detail" }),
        group_media: group("Изображения и документы", 2),
        group_specs: group("Характеристики", 3),
        group_sales: group("Цена и наличие", 4),
        group_visibility: group("Публикация в каталоге", 5),
        group_seo: group("SEO", 6, { closed: true }),
        group_source: group("Источник и проверка", 7, { closed: true }),
        group_analogs: group("Аналоги", 8, { closed: true }),
        group_system: group("Служебное", 9, { closed: true }),
      },
      fields: {
        status: input("Статус", "group_main", 1, { width: "half" }),
        slug: input("Адрес товара", "group_main", 2),
        title: input("Название товара", "group_main", 3),
        sku: input("Артикул", "group_main", 4, { width: "half" }),
        category: input("Категория", "group_main", 5, { width: "half" }),
        brand: input("Бренд", "group_main", 6, { width: "half" }),
        mpn: input("MPN / номер производителя", "group_main", 7, { width: "half" }),
        gtin: input("GTIN", "group_main", 8, { width: "half" }),
        part_type: input("Тип детали", "group_main", 9, { width: "half" }),
        short_description: input("Краткое описание", "group_main", 10),
        full_description: input("Полное описание", "group_main", 11),
        cta_text: input("Текст кнопки заявки", "group_main", 12),
        related_products: input("Связанные товары", "group_main", 13),
        lead_form: input("Форма заявки", "group_main", 14),
        main_image: input("Основное изображение", "group_media", 1, {
          interface: "file-image",
          options: { crop: false },
        }),
        image_alt: input("Alt-текст основного изображения", "group_media", 2),
        gallery: input("Предпросмотр галереи", "group_media", 3, {
          interface: "deere-shop-product-gallery-preview",
          hidden: false,
          readonly: true,
          note: "Автоматический предпросмотр всех изображений из канонической связи product_images. Изменения выполняются в поле «Управление галереей» ниже.",
        }),
        documents: input("Документы", "group_media", 4, documentRepeater),
        image_items: input("Управление галереей", "group_media", 5, {
          interface: "list-o2m",
          options: {
            layout: "list",
            template: "{{image}} {{alt_text}}",
            enableCreate: true,
            enableSelect: false,
            limit: 15,
          },
          hidden: false,
          note: "Все изображения галереи из канонической связи product_images. Нажмите изображение, чтобы изменить файл, alt-текст или порядок.",
        }),
        document_items: input("Документы (структурные)", "group_media", 6, {
          interface: "list-o2m",
          options: { template: "{{title}}", enableCreate: true, enableSelect: false },
          hidden: true,
          note: "Канонические документы товара (product_documents). Скрыто до перехода R7C — до него редактируется список JSON.",
        }),
        specifications: input("Характеристики", "group_specs", 1, specificationRepeater),
        specification_items: input("Характеристики (структурные)", "group_specs", 2, {
          interface: "list-o2m",
          options: { template: "{{name}}: {{value}} {{unit}}", enableCreate: true, enableSelect: false },
          hidden: true,
          note: "Канонические характеристики товара (product_specifications). Скрыто до перехода R7C — до них редактируется список JSON.",
        }),
        price: input("Цена", "group_sales", 1, { width: "half" }),
        currency: input("Валюта", "group_sales", 2, { width: "half" }),
        price_status: input("Статус цены", "group_sales", 3, { width: "half" }),
        availability_status: input("Наличие", "group_sales", 4, { width: "half" }),
        delivery_status: input("Условия поставки", "group_sales", 5),
        sort_order: input("Порядок", "group_visibility", 1, { width: "half" }),
        popularity_score: input("Популярность", "group_visibility", 2, { width: "half" }),
        is_featured: input("Рекомендуемый товар", "group_visibility", 3, { width: "half" }),
        show_on_homepage: input("Показывать на главной", "group_visibility", 4, { width: "half" }),
        seo_title: input("SEO-заголовок", "group_seo", 1),
        seo_description: input("SEO-описание", "group_seo", 2),
        seo_text: input("SEO-текст", "group_seo", 3),
        og_image: input("Изображение Open Graph", "group_seo", 4, { interface: "file-image" }),
        seo_quality_status: input("Статус SEO-проверки", "group_seo", 5, { width: "half" }),
        is_indexable: input("Разрешить индексацию", "group_seo", 6, { width: "half" }),
        seo: seoPluginInput(7),
        source_name: input("Название источника", "group_source", 1),
        source_url: input("Ссылка на источник", "group_source", 2),
        verified_at: input("Проверено", "group_source", 3, { width: "half" }),
        reviewed_by: input("Проверил", "group_source", 4, { width: "half" }),
        analogs_from: input("Связи: исходящие (служебное)", "group_analogs", 1, {
          interface: "list-o2m",
          options: { template: "{{relation_type}} · {{product_to.sku}}", enableCreate: false, enableSelect: false },
          hidden: true,
          note: "Рёбра products_analogs, где товар стоит в product_from. Редактируйте связи в коллекции «Аналоги товаров».",
        }),
        analogs_to: input("Связи: входящие (служебное)", "group_analogs", 2, {
          interface: "list-o2m",
          options: { template: "{{relation_type}} · {{product_from.sku}}", enableCreate: false, enableSelect: false },
          hidden: true,
          note: "Рёбра products_analogs, где товар стоит в product_to. Редактируйте связи в коллекции «Аналоги товаров».",
        }),
        id: input("Идентификатор", "group_system", 1, { hidden: true, readonly: true }),
        translations: input("Переводы", "group_system", 2, { hidden: true }),
        created_at: input("Создано", "group_system", 3, { width: "half", readonly: true }),
        updated_at: input("Обновлено", "group_system", 4, { width: "half", readonly: true }),
        sku_normalized: input("Артикул (нормализованный)", "group_system", 5, {
          hidden: true,
          readonly: true,
          note: "Индексный ключ поиска — заполняется только миграцией backfill-product-search.",
        }),
        mpn_normalized: input("MPN (нормализованный)", "group_system", 6, {
          hidden: true,
          readonly: true,
          note: "Индексный ключ поиска — заполняется только миграцией backfill-product-search.",
        }),
      },
    },
    site_settings: {
      groups: {
        group_company: group("Компания", 1, { interface: "group-detail" }),
        group_contacts: group("Контакты", 2, { interface: "group-detail" }),
        group_brand: group("Оформление", 3),
        group_cta: group("Основное действие", 4),
        group_legal: group("Реквизиты", 5, { closed: true }),
        group_footer: group("Подвал и документы", 6),
        group_seo: group("SEO по умолчанию", 7, { closed: true }),
        group_analytics: group("Аналитика", 8, { closed: true }),
        group_system: group("Служебное", 9, { closed: true }),
      },
      fields: {
        company_name: input("Название компании", "group_company", 1),
        legal_name: input("Юридическое название", "group_company", 2),
        company_image: input("Изображение компании", "group_company", 3),
        phone: input("Телефон", "group_contacts", 1, { width: "half" }),
        email: input("Email", "group_contacts", 2, { width: "half" }),
        address: input("Адрес", "group_contacts", 3),
        city: input("Город", "group_contacts", 4, { width: "half" }),
        working_hours: input("Часы работы", "group_contacts", 5, { width: "half" }),
        delivery_region: input("Регион поставки", "group_contacts", 6),
        messengers: input("Мессенджеры", "group_contacts", 7, messengerRepeater),
        social_links: input("Социальные сети", "group_contacts", 8),
        logo: input("Логотип", "group_brand", 1, { interface: "file-image" }),
        favicon: input("Favicon", "group_brand", 2, { interface: "file-image" }),
        primary_color: input("Основной цвет", "group_brand", 3, { width: "half" }),
        accent_color: input("Акцентный цвет", "group_brand", 4, { width: "half" }),
        primary_cta_text: input("Текст основной кнопки", "group_cta", 1, { width: "half" }),
        primary_cta_url: input("Ссылка основной кнопки", "group_cta", 2, { width: "half" }),
        inn: input("ИНН", "group_legal", 1, { width: "half" }),
        kpp: input("КПП", "group_legal", 2, { width: "half" }),
        ogrn: input("ОГРН", "group_legal", 3, { width: "half" }),
        legal_address: input("Юридический адрес", "group_legal", 4),
        vat_info: input("Информация о НДС", "group_legal", 5),
        footer_text: input("Текст подвала", "group_footer", 1),
        footer_disclaimer: input("Примечание в подвале", "group_footer", 2),
        requisites_url: input("Ссылка на реквизиты", "group_footer", 3),
        documents_url: input("Ссылка на документы", "group_footer", 4),
        seo_title: input("SEO-заголовок по умолчанию", "group_seo", 1),
        seo_description: input("SEO-описание по умолчанию", "group_seo", 2),
        og_title: input("Заголовок Open Graph", "group_seo", 3),
        og_description: input("Описание Open Graph", "group_seo", 4),
        default_og_image: input("Изображение Open Graph", "group_seo", 5),
        yandex_metrica_id: input("ID Яндекс Метрики", "group_analytics", 1, { width: "half" }),
        gtm_id: input("ID Google Tag Manager", "group_analytics", 2, { width: "half" }),
        id: input("Идентификатор", "group_system", 1, { hidden: true, readonly: true }),
        translations: input("Переводы", "group_system", 2, { hidden: true }),
        created_at: input("Создано", "group_system", 3, { width: "half", readonly: true }),
        updated_at: input("Обновлено", "group_system", 4, { width: "half", readonly: true }),
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
