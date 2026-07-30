import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { accessBlueprint } from "../access/blueprint.mjs";
import { DirectusAdminClient } from "../schema/apply-schema.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const assetRoot = resolve(here, "../seed-assets");
const manifest = JSON.parse(
  await readFile(resolve(assetRoot, "manifest.json"), "utf8"),
);

const articles = [
  {
    title: "Как подготовить данные для подбора запчасти John Deere",
    slug: "kak-podgotovit-dannye-dlya-podbora-zapchasti-john-deere",
    excerpt:
      "Какие исходные данные приложить к запросу, чтобы быстрее проверить применимость детали.",
    published_at: "2026-07-10T09:00:00.000Z",
    sort_order: 10,
    content:
      "<h2>Начните с модели техники</h2><p>Укажите модель машины и, если он доступен, серийный номер. Эти данные помогают отделить внешне похожие исполнения и понять, какие уточнения ещё нужны.</p><h2>Добавьте артикул и фотографии</h2><p>Перепишите номер с детали без сокращений. Сделайте общий снимок узла и отдельное резкое фото маркировки при хорошем освещении.</p><ul><li>модель и серийный номер техники;</li><li>артикул или вся видимая маркировка;</li><li>фото детали и места установки;</li><li>краткое описание задачи.</li></ul><h2>Что не стоит предполагать заранее</h2><p>Одинаковый внешний вид не подтверждает совместимость. Итоговый подбор требует проверки исходных данных и комплектации машины.</p>",
  },
  {
    title: "Где искать артикул и маркировку на детали",
    slug: "gde-iskat-artikul-i-markirovku-na-detali",
    excerpt:
      "Практический порядок осмотра корпуса, таблички и упаковки без догадок по внешнему виду.",
    published_at: "2026-07-17T09:00:00.000Z",
    sort_order: 20,
    content:
      "<h2>Осмотрите корпус детали</h2><p>Номер может быть выбит, отлит, нанесён краской или расположен на отдельной табличке. Очистите участок так, чтобы не повредить покрытие и маркировку.</p><h2>Проверьте несколько источников</h2><ul><li>табличку на корпусе узла;</li><li>торец, фланец и зону рядом с разъёмом;</li><li>этикетку сохранившейся упаковки;</li><li>документы на ранее установленную деталь.</li></ul><h2>Сделайте читаемое фото</h2><p>Снимайте перпендикулярно поверхности, без бликов. Полезны два кадра: общий вид для понимания узла и крупный план номера.</p><blockquote>Не восстанавливайте нечитаемые символы по памяти — укажите сомнительный знак отдельно.</blockquote>",
  },
  {
    title: "Что проверить перед заказом комплектующих",
    slug: "chto-proverit-pered-zakazom-komplektuyuschih",
    excerpt:
      "Короткий список проверок совместимости, комплектации и состава запроса перед согласованием.",
    published_at: "2026-07-24T09:00:00.000Z",
    sort_order: 30,
    content:
      "<h2>Сверьте исходные данные</h2><p>Проверьте модель техники, серийный номер, артикул и фотографии маркировки. Если деталь уже демонтирована, сохраните снимок места установки и разъёмов.</p><h2>Уточните состав запроса</h2><ul><li>нужна отдельная деталь или комплект;</li><li>какие крепёжные элементы и уплотнения требуется проверить;</li><li>есть ли ограничения по исполнению узла;</li><li>какие документы необходимо приложить к запросу.</li></ul><h2>Согласуйте результат проверки</h2><p>До оформления важно подтвердить применимость к конкретной машине, состав комплекта, доступность и условия поставки. Эти параметры могут различаться и требуют отдельного уточнения.</p>",
  },
];

const processItems = [
  {
    number: "01",
    icon: "clipboard",
    title: "Отправка запроса",
    text: "Вы передаёте артикул, модель техники или фото детали.",
    details: ["Форма на сайте", "Телефон или мессенджер"],
  },
  {
    number: "02",
    icon: "search",
    title: "Проверка данных",
    text: "Уточняем маркировку, исполнение узла и исходные параметры.",
    details: ["Без догадок по внешнему виду", "Запрашиваем недостающие данные"],
  },
  {
    number: "03",
    icon: "check",
    title: "Предложение",
    text: "Формируем вариант по подтверждённым исходным данным.",
    details: ["Состав комплекта", "Доступность и условия"],
  },
  {
    number: "04",
    icon: "handshake",
    title: "Согласование поставки",
    text: "Фиксируем состав запроса и дальнейший порядок действий.",
    details: ["Проверка перед оформлением", "Подтверждение контакта"],
  },
];

const homeSections = [
  {
    section_type: "hero",
    title: "Запчасти и комплектующие John Deere",
    subtitle: "Каталог и подбор решений",
    text: "Найдём нужную деталь по артикулу, модели техники или фотографии маркировки.",
    button_text: "Открыть каталог",
    button_url: "/catalog",
    settings: { image_alt: "Техника John Deere в поле" },
    sort_order: 0,
  },
  {
    section_type: "categories",
    title: "Категории продукции",
    subtitle: "Выберите направление",
    button_text: "Весь каталог",
    button_url: "/catalog",
    sort_order: 10,
  },
  {
    section_type: "featured_products",
    title: "Избранные товары",
    subtitle: "Популярные позиции каталога",
    button_text: "Смотреть каталог",
    button_url: "/catalog",
    sort_order: 20,
  },
  {
    section_type: "advantages",
    title: "Что важно при подборе",
    items: [
      { icon: "search", title: "Проверяем данные", text: "Сверяем артикул, модель и маркировку." },
      { icon: "shield", title: "Не делаем догадок", text: "Уточняем совместимость и состав комплекта." },
      { icon: "package", title: "Согласуем поставку", text: "Обсуждаем наличие и условия до заказа." },
    ],
    sort_order: 25,
  },
  {
    section_type: "steps",
    title: "Как происходит подбор",
    subtitle: "Четыре понятных шага",
    text: "Передайте исходные данные — мы проверим запрос и вернёмся с предложением.",
    items: processItems,
    sort_order: 40,
  },
  {
    section_type: "articles",
    title: "Практические статьи",
    subtitle: "База знаний",
    button_text: "Все статьи",
    button_url: "/articles",
    sort_order: 50,
  },
  {
    section_type: "faq",
    title: "Вопросы и ответы",
    subtitle: "Полезная информация",
    sort_order: 60,
  },
  {
    section_type: "contacts",
    title: "Свяжитесь с нами",
    text: "Используйте доступный канал связи или оставьте заявку на подбор.",
    sort_order: 70,
  },
  {
    section_type: "lead_form",
    title: "Оставьте заявку на подбор",
    text: "Укажите контакты и нужные позиции — мы уточним детали запроса.",
    button_text: "Отправить заявку",
    button_url: "/contacts#consultation",
    sort_order: 71,
  },
  {
    section_type: "cta",
    title: "Нужна помощь с подбором?",
    text: "Передайте артикул, модель техники или фотографию маркировки.",
    button_text: "Отправить запрос",
    button_url: "#consultation",
    sort_order: 72,
  },
];

const encode = (value) => encodeURIComponent(String(value));

async function findOne(client, collection, field, value, fields = "id") {
  const items = await client.request(
    `/items/${collection}?filter[${field}][_eq]=${encode(value)}&fields=${encode(fields)}&limit=1`,
  );
  return items[0] ?? null;
}

async function uploadAsset(client, relativePath, title) {
  const existing = await client.request(
    `/files?filter[title][_eq]=${encode(title)}&fields=id&limit=1`,
  );
  if (existing[0]) return existing[0].id;

  const bytes = await readFile(resolve(assetRoot, relativePath));
  const form = new FormData();
  form.append("title", title);
  form.append("folder", accessBlueprint.publicAssetFolder.id);
  form.append(
    "file",
    new Blob([bytes], { type: "image/webp" }),
    relativePath.split("/").at(-1),
  );
  const response = await fetch(`${client.baseUrl}/files`, {
    method: "POST",
    headers: { authorization: `Bearer ${client.token}` },
    body: form,
  });
  if (!response.ok) {
    throw new Error(`Asset upload failed (${response.status}): ${await response.text()}`);
  }
  return (await response.json()).data.id;
}

async function patchItem(client, collection, id, data) {
  return client.request(`/items/${collection}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

async function upsertItem(client, collection, field, value, data) {
  const existing = await findOne(client, collection, field, value);
  if (existing) return patchItem(client, collection, existing.id, data);
  return client.request(`/items/${collection}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

async function ensureHomePage(client) {
  const existing = await findOne(client, "pages", "slug", "home");
  if (existing) {
    return existing;
  }
  return client.request("/items/pages", {
    method: "POST",
    body: JSON.stringify({
      status: "published",
      title: "Каталог комплектующих John Deere",
      slug: "home",
      h1: "Запчасти и комплектующие John Deere",
      seo_title: "Каталог комплектующих John Deere — DEERE-SHOP",
      seo_description: "Каталог деталей и подбор комплектующих John Deere по артикулу, модели техники и фотографии маркировки.",
      seo_text: null,
      translations: {},
    }),
  });
}

async function upsertPageSection(client, pageId, definition) {
  const query = `/items/page_sections?filter[page][_eq]=${encode(pageId)}&filter[section_type][_eq]=${encode(definition.section_type)}&fields=id&limit=1`;
  const existing = (await client.request(query))[0];
  const data = {
    page: pageId,
    status: "published",
    title: null,
    subtitle: null,
    text: null,
    image: null,
    button_text: null,
    button_url: null,
    items: [],
    settings: {},
    is_visible: true,
    translations: {},
    ...definition,
  };
  if (existing) return patchItem(client, "page_sections", existing.id, data);
  return client.request("/items/page_sections", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

async function publishCatalog(client) {
  const categories = await client.request(
    "/items/categories?fields=id,slug,parent&limit=-1",
  );
  const homepageSlugs = new Set(manifest.categoryIcons.slice(0, 12).map((item) => item.slug));
  for (const category of categories) {
    await patchItem(client, "categories", category.id, {
      status: "published",
      show_on_homepage: Boolean(category.parent && homepageSlugs.has(category.slug)),
    });
  }

  const products = await client.request("/items/products?fields=id&limit=-1");
  for (const [index, product] of products.entries()) {
    await patchItem(client, "products", product.id, {
      status: "published",
      is_featured: index < 5,
      show_on_homepage: index < 5,
    });
  }
}

export async function syncEditorialAssets(client) {
  await publishCatalog(client);

  for (const icon of manifest.categoryIcons) {
    const category = await findOne(client, "categories", "slug", icon.slug);
    if (!category) throw new Error(`Unknown category slug: ${icon.slug}`);
    const fileId = await uploadAsset(client, icon.file, `category-icon:${icon.slug}`);
    await patchItem(client, "categories", category.id, {
      icon: fileId,
      icon_alt: icon.alt,
    });
  }

  for (const article of articles) {
    const cover = manifest.articleCovers.find((item) => item.slug === article.slug);
    const coverId = await uploadAsset(
      client,
      cover.file,
      `article-cover:${article.slug}`,
    );
    await upsertItem(client, "articles", "slug", article.slug, {
      ...article,
      status: "published",
      cover_image: coverId,
      image_alt: cover.alt,
      is_featured: true,
      seo_title: article.title,
      seo_description: article.excerpt,
      og_image: coverId,
      translations: {},
    });
  }

  const home = await ensureHomePage(client);

  for (const section of homeSections) {
    await upsertPageSection(client, home.id, section);
  }

  const faqItems = [
    ["Как отправить список артикулов?", "Укажите артикулы в форме заявки и добавьте модель техники или фото маркировки."],
    ["Можно ли уточнить совместимость?", "Да. Для проверки нужны модель техники, артикул и доступные фотографии детали."],
    ["Что делать, если цена не указана?", "Отправьте запрос через форму — стоимость и условия поставки уточняются отдельно."],
  ];
  for (const [index, [question, answer]] of faqItems.entries()) {
    await upsertItem(client, "faq_items", "question", question, {
      status: "published",
      page: home.id,
      question,
      answer,
      sort_order: index,
      is_visible: true,
      translations: {},
    });
  }

  const sections = await client.request(
    `/items/page_sections?filter[page][_eq]=${home.id}&fields=id,section_type&limit=-1`,
  );
  const process = sections.find(({ section_type }) =>
    ["process", "steps"].includes(section_type),
  );
  if (process) {
    await patchItem(client, "page_sections", process.id, {
      section_type: "steps",
      items: processItems,
      sort_order: 40,
    });
  }

  const articleSection = sections.find(
    ({ section_type }) => section_type === "articles",
  );
  const articleSectionData = {
    page: home.id,
    status: "published",
    section_type: "articles",
    title: "Практические статьи",
    subtitle: "База знаний",
    text: null,
    button_text: "Все статьи",
    button_url: "/articles",
    items: [],
    settings: {},
    is_visible: true,
    sort_order: 50,
    translations: {},
  };
  if (articleSection) {
    await patchItem(client, "page_sections", articleSection.id, articleSectionData);
  } else {
    await client.request("/items/page_sections", {
      method: "POST",
      body: JSON.stringify(articleSectionData),
    });
  }

  await upsertItem(client, "navigation_items", "url", "/articles", {
    status: "published",
    label: "Статьи",
    url: "/articles",
    location: "header",
    open_in_new_tab: false,
    is_visible: true,
    sort_order: 50,
    translations: {},
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const client = await DirectusAdminClient.connectFromEnvironment();
  await syncEditorialAssets(client);
  console.log("Category icons, starter articles, process steps and navigation are synchronized.");
}
