import { DirectusAdminClient, isMainModule } from "../schema/apply-schema.mjs";

export const HOME_PAGE_ID = "c5f2ea7b-4546-4b51-88d2-06402831761a";

const relationId = (value) =>
  typeof value === "string" ? value : (value?.id ?? null);

const samePayload = (current, desired) =>
  current && Object.entries(desired).every(([key, value]) => {
    const currentValue = ["source_page", "hero_image", "og_image"].includes(key)
      ? relationId(current[key])
      : current[key] ?? null;
    return JSON.stringify(currentValue) === JSON.stringify(value ?? null);
  });

export function buildHomePagePayload(page, hero) {
  return {
    status: "published",
    source_page: page.id,
    h1: page.h1,
    hero_title: hero.title,
    hero_text: hero.text,
    hero_image: relationId(hero.image),
    hero_image_alt: hero.title,
    hero_primary_button_text: hero.button_text ?? "Отправить запрос",
    hero_primary_button_url: hero.button_url ?? "#consultation",
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
    seo_title: page.seo_title ?? null,
    seo_description: page.seo_description ?? null,
    canonical_url: page.canonical_url ?? null,
    og_title: page.og_title ?? null,
    og_description: page.og_description ?? null,
    og_image: relationId(page.og_image),
    is_indexable: page.is_indexable ?? true,
  };
}

const pageQuery = () => new URLSearchParams({
  "filter[status][_eq]": "published",
  "filter[slug][_eq]": "home",
  fields: "id,h1,seo_title,seo_description,canonical_url,og_image,is_indexable",
  limit: "2",
});

const sectionQuery = (pageId) => new URLSearchParams({
  "filter[page][_eq]": pageId,
  fields: "id,section_type,status,is_visible,title,text,image,button_text,button_url,page,home_page",
  sort: "sort_order",
  limit: "-1",
});

export async function migrateHomePage(
  client,
  { apply = false } = {},
) {
  const actions = [];
  const pages = await client.request(`/items/pages?${pageQuery().toString()}`);
  if (pages.length !== 1) {
    throw new Error("Expected exactly one published home page");
  }
  const page = pages[0];
  const sections = await client.request(
    `/items/page_sections?${sectionQuery(page.id).toString()}`,
  );
  const heroes = sections.filter(
    (section) =>
      section.section_type === "hero" &&
      section.status === "published" &&
      section.is_visible !== false &&
      section.title?.trim() &&
      section.text?.trim() &&
      relationId(section.image),
  );
  if (heroes.length !== 1) {
    throw new Error("Expected exactly one complete published hero");
  }

  const desired = buildHomePagePayload(page, heroes[0]);
  const current = await client.request("/items/home_page");
  if (!samePayload(current, desired) || current?.id !== HOME_PAGE_ID) {
    actions.push("write home_page singleton");
    if (apply) {
      await client.request("/items/home_page", {
        method: "PATCH",
        body: JSON.stringify({ id: HOME_PAGE_ID, ...desired }),
      });
    }
  }

  for (const section of sections) {
    if (section.section_type === "hero") continue;
    if (relationId(section.home_page) === HOME_PAGE_ID) continue;
    actions.push(`link page_sections.${section.id} -> home_page`);
    if (apply) {
      await client.request(`/items/page_sections/${encodeURIComponent(section.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ home_page: HOME_PAGE_ID }),
      });
    }
  }

  return actions;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const client = await DirectusAdminClient.connectFromEnvironment();
  const actions = await migrateHomePage(client, { apply });
  console.log(`${apply ? "Applied" : "Planned"} ${actions.length} homepage migration actions:`);
  for (const action of actions) console.log(`- ${action}`);
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
