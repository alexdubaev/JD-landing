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

if (!loginResponse.ok) {
  throw new Error(`Directus login failed: ${loginResponse.status}`);
}

const token = (await loginResponse.json()).data.access_token;
const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(body));
  return body.data;
};

const settings = await request(
  "/items/site_settings?fields=logo.id,logo.title,logo.width,logo.height",
);
let file = settings.logo;

if (
  file?.title !== "DEERE-SHOP transparent logo" ||
  file?.width !== 1829 ||
  file?.height !== 251
) {
  const logo = await readFile(
    new URL(
      "../data/deere-shop-codex-hero/deere_shop_hero_assetpack/images/logo.png",
      import.meta.url,
    ),
  );
  const form = new FormData();

  form.set("folder", "1ecf70c5-0ad4-4e5e-8d73-78ee549f064a");
  form.set("title", "DEERE-SHOP transparent logo");
  form.set(
    "file",
    new Blob([logo], { type: "image/png" }),
    "deere-shop-logo.png",
  );

  const uploadResponse = await fetch(`${baseUrl}/files`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });

  if (!uploadResponse.ok) {
    throw new Error(
      `Directus upload failed: ${uploadResponse.status} ${await uploadResponse.text()}`,
    );
  }

  file = (await uploadResponse.json()).data;
}
const updateResponse = await fetch(`${baseUrl}/items/site_settings`, {
  method: "PATCH",
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({ logo: file.id }),
});

if (!updateResponse.ok) {
  throw new Error(
    `site_settings update failed: ${updateResponse.status} ${await updateResponse.text()}`,
  );
}

const publicResponse = await fetch(
  `${baseUrl}/assets/${file.id}?width=720&fit=contain`,
  { headers: { authorization: `Bearer ${token}` } },
);

if (!publicResponse.ok) {
  throw new Error(`Directus logo failed: ${publicResponse.status}`);
}

const mediaResponse = await fetch(
  `http://localhost:3000/media/${file.id}?width=720&fit=contain`,
);

if (!mediaResponse.ok) {
  throw new Error(`Frontend media route failed: ${mediaResponse.status}`);
}

console.log(
  JSON.stringify({
    filename: file.filename_download,
    id: file.id,
    directusStatus: publicResponse.status,
    mediaStatus: mediaResponse.status,
    type: publicResponse.headers.get("content-type"),
  }),
);
