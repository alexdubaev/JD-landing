import { expect, it } from "vitest";

import sitemap from "./sitemap";

it("excludes noindex-only routes from sitemap", async () => {
  const entries = await sitemap();
  const urls = entries.map(({ url }) => url);

  expect(urls).not.toContain("https://deere-shop.ru/thank-you");
  expect(urls).not.toContain("https://deere-shop.ru/parts-request");
});
