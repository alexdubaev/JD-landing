import { expect, it, vi } from "vitest";
const { getArticlesPage } = vi.hoisted(() => ({ getArticlesPage: vi.fn() }));
vi.mock("@/lib/directus/articles", () => ({ getArticlesPage }));
import { generateMetadata } from "./page";
it("rejects out-of-range pagination before streaming", async () => {
  getArticlesPage.mockResolvedValue({ totalPages: 1 });
  await expect(generateMetadata({ searchParams: Promise.resolve({ page: "2" }) })).rejects.toThrow();
});
it("gives real subsequent pages their own canonical and title", async () => {
  getArticlesPage.mockResolvedValue({ totalPages: 3 });
  const metadata = await generateMetadata({ searchParams: Promise.resolve({ page: "2" }) });
  expect(metadata.alternates?.canonical).toBe("/articles?page=2");
  expect(metadata.title).toContain("страница 2");
});
