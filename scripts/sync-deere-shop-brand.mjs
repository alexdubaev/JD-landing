import { readFile } from "node:fs/promises";

const env = Object.fromEntries(
  (await readFile(new URL("../directus/.env", import.meta.url), "utf8"))
    .split(/\r?\n/u)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const baseUrl = "http://localhost:8055";
const loginResponse = await fetch(`${baseUrl}/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
  }),
});
const login = await loginResponse.json();
const headers = {
  authorization: `Bearer ${login.data.access_token}`,
  "content-type": "application/json; charset=utf-8",
};

const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(body));
  return body.data;
};

const settings = await request(
  "/items/site_settings?fields=logo,company_name",
);
const hero = await request(
  "/items/page_sections/3762f91e-40e7-4ba6-8568-5dd64a7de790?fields=image",
);
const publicFolder = "1ecf70c5-0ad4-4e5e-8d73-78ee549f064a";

for (const fileId of [settings.logo, hero.image].filter(Boolean)) {
  await request(`/files/${fileId}`, {
    method: "PATCH",
    body: JSON.stringify({ folder: publicFolder }),
  });
}

await request("/items/site_settings", {
  method: "PATCH",
  body: JSON.stringify({
    company_name: "DEERE-SHOP",
    primary_color: "#4C8F2B",
    accent_color: "#FFC107",
    footer_text:
      "Каталог комплектующих John Deere и подбор решений под задачи клиента.",
  }),
});

await request(
  "/items/page_sections/3762f91e-40e7-4ba6-8568-5dd64a7de790",
  {
    method: "PATCH",
    body: JSON.stringify({
      title: "Запчасти и комплектующие John Deere",
      subtitle: "Каталог и подбор по артикулу",
      text:
        "Введите артикул детали — покажем позиции каталога и поможем уточнить совместимость.",
      settings: {
        image_alt: "Трактор John Deere в поле",
        disclaimer:
          "DEERE-SHOP не заявляет статус официального представителя John Deere.",
      },
    }),
  },
);

await request("/items/pages/1cd1d1bc-95d3-43bd-a2d0-ffd4f7757229", {
  method: "PATCH",
  body: JSON.stringify({
    title: "DEERE-SHOP",
    h1: "Запчасти и комплектующие John Deere",
    seo_title: "DEERE-SHOP — запчасти и комплектующие John Deere",
    seo_description:
      "Каталог комплектующих John Deere с поиском по артикулу и помощью в подборе.",
  }),
});

const navigation = [
  { label: "Каталог", url: "/catalog" },
  { label: "Доставка и оплата", url: "/delivery" },
  { label: "О компании", url: "/about" },
  { label: "Контакты", url: "/contacts" },
];
const existingNavigation = await request(
  "/items/navigation_items?fields=id,url&limit=-1",
);
const existingUrls = new Set(existingNavigation.map((item) => item.url));

for (const [sortOrder, item] of navigation.entries()) {
  if (existingUrls.has(item.url)) continue;
  await request("/items/navigation_items", {
    method: "POST",
    body: JSON.stringify({
      ...item,
      status: "published",
      location: "header",
      is_visible: true,
      sort_order: sortOrder + 1,
    }),
  });
}

console.log("DEERE-SHOP content and public assets synchronized");
