import test from "node:test";
import assert from "node:assert/strict";

import {
  HOME_PAGE_ID,
  buildHomePagePayload,
  migrateHomePage,
} from "./migrate-home-page.mjs";

const page = {
  id: "1cd1d1bc-95d3-43bd-a2d0-ffd4f7757229",
  h1: "Запчасти и комплектующие John Deere",
  seo_title: "Каталог запчастей",
  seo_description: "Описание каталога",
  canonical_url: null,
  og_title: null,
  og_description: null,
  og_image: null,
  is_indexable: true,
};

const hero = {
  id: "hero-section",
  section_type: "hero",
  status: "published",
  is_visible: true,
  title: "Запчасти и комплектующие John Deere",
  text: "Найдём нужную деталь по артикулу, модели техники или фотографии маркировки.",
  image: "d6705156-10bf-4920-95d1-1ff011f54e70",
  button_text: null,
  button_url: null,
};

test("maps existing hero content and frontend microcopy into the singleton", () => {
  assert.deepEqual(buildHomePagePayload(page, hero), {
    status: "published",
    source_page: page.id,
    h1: page.h1,
    hero_title: hero.title,
    hero_text: hero.text,
    hero_image: hero.image,
    hero_image_alt: hero.title,
    hero_primary_button_text: "Отправить запрос",
    hero_primary_button_url: "#consultation",
    hero_secondary_button_text: null,
    hero_secondary_button_url: null,
    hero_search_label: "Поиск по каталогу",
    hero_search_placeholder: "Введите артикул детали",
    hero_search_button_text: "Найти",
    hero_bulk_prompt: "Нужно проверить несколько позиций?",
    hero_bulk_link_text: "Вставить список",
    hero_bulk_link_url: "/parts-request",
    hero_excel_link_text: "Загрузить Excel",
    hero_excel_link_url: "/parts-request?mode=excel#attachments",
    hero_photo_link_text: "Отправить фото",
    hero_photo_link_url: "/parts-request?mode=photo#attachments",
    seo_title: page.seo_title,
    seo_description: page.seo_description,
    canonical_url: null,
    og_title: null,
    og_description: null,
    og_image: null,
    is_indexable: true,
  });
});

test("queries only fields that exist on the legacy pages collection", async () => {
  const paths = [];
  const payload = buildHomePagePayload(page, hero);
  const client = {
    async request(path) {
      paths.push(path);
      if (path.startsWith("/items/pages?")) return [page];
      if (path.startsWith("/items/page_sections?")) return [hero];
      if (path === "/items/home_page") return { id: HOME_PAGE_ID, ...payload };
      return {};
    },
  };

  await migrateHomePage(client);
  const pagesRequest = decodeURIComponent(paths.find((path) => path.startsWith("/items/pages?")));
  assert.equal(pagesRequest.includes("og_title"), false);
  assert.equal(pagesRequest.includes("og_description"), false);
});

test("rejects ambiguous or incomplete published hero content before writes", async () => {
  for (const sections of [[], [hero, { ...hero, id: "hero-2" }], [{ ...hero, image: null }]]) {
    let writes = 0;
    const client = {
      async request(path, options = {}) {
        if ((options.method ?? "GET") !== "GET") writes += 1;
        if (path.startsWith("/items/pages?")) return [page];
        if (path.startsWith("/items/page_sections?")) return sections;
        return null;
      },
    };
    await assert.rejects(
      () => migrateHomePage(client, { apply: true }),
      /exactly one complete published hero/i,
    );
    assert.equal(writes, 0);
  }
});

test("creates the singleton and links every non-hero section while retaining page", async () => {
  const calls = [];
  const sections = [
    hero,
    { id: "categories", section_type: "categories", page: page.id, home_page: null },
    { id: "faq", section_type: "faq", page: page.id, home_page: null },
  ];
  const client = {
    async request(path, options = {}) {
      calls.push({ path, method: options.method ?? "GET", body: options.body });
      if (path.startsWith("/items/pages?")) return [page];
      if (path.startsWith("/items/page_sections?")) return sections;
      if (path === "/items/home_page") return null;
      return {};
    },
  };

  const actions = await migrateHomePage(client, { apply: true });

  assert.ok(actions.includes("write home_page singleton"));
  const singletonWrite = calls.find(
    ({ path, method }) => path === "/items/home_page" && method === "PATCH",
  );
  assert.equal(JSON.parse(singletonWrite.body).id, HOME_PAGE_ID);
  for (const id of ["categories", "faq"]) {
    const write = calls.find(
      ({ path, method }) => path === `/items/page_sections/${id}` && method === "PATCH",
    );
    assert.deepEqual(JSON.parse(write.body), { home_page: HOME_PAGE_ID });
  }
});

test("is idempotent when singleton data and section links already match", async () => {
  const payload = buildHomePagePayload(page, hero);
  const client = {
    async request(path, options = {}) {
      if ((options.method ?? "GET") !== "GET") {
        throw new Error(`unexpected write ${path}`);
      }
      if (path.startsWith("/items/pages?")) return [page];
      if (path.startsWith("/items/page_sections?")) {
        return [hero, { id: "faq", section_type: "faq", page: page.id, home_page: HOME_PAGE_ID }];
      }
      if (path === "/items/home_page") return { id: HOME_PAGE_ID, ...payload };
      return {};
    },
  };

  assert.deepEqual(await migrateHomePage(client, { apply: true }), []);
});
