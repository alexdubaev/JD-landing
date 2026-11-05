import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ categories: vi.fn(), products: vi.fn(), articles: vi.fn() }));
vi.mock("@/lib/directus/catalog", () => ({ getCategorySitemapEntries: mocks.categories, getProductSitemapEntries: mocks.products }));
vi.mock("@/lib/directus/articles", () => ({ getArticleSitemapEntries: mocks.articles }));
import sitemap from "./sitemap";
beforeEach(() => {
  mocks.categories.mockResolvedValue([{ slug: "engine" }]);
  mocks.products.mockResolvedValue([{ categorySlug: "engine", productSlug: "part" }]);
  mocks.articles.mockResolvedValue([]);
});
it("includes catalogue URLs and excludes noindex service routes", async () => {
  const urls = (await sitemap()).map(({ url }) => url);
  expect(urls).toContain("https://deere-shop.ru/catalog/engine/part");
  for (const path of ["thank-you", "parts-request", "cart"]) expect(urls).not.toContain(`https://deere-shop.ru/${path}`);
});
it("does not publish a truncated successful sitemap when the CMS fails", async () => {
  mocks.products.mockRejectedValue(new Error("CMS unavailable"));
  await expect(sitemap()).rejects.toThrow("CMS unavailable");
});
