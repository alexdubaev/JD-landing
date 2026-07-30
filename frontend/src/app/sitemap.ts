import type { MetadataRoute } from "next";

import {
  getCategories,
  getProductSitemapEntries,
} from "@/lib/directus/catalog";
import { getArticleSitemapEntries } from "@/lib/directus/articles";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://deere-shop.ru"
  ).replace(/\/+$/u, "");
  const staticPaths = [
    "",
    "/catalog",
    "/articles",
    "/about",
    "/delivery",
    "/contacts",
    "/privacy-policy",
  ];
  const result: MetadataRoute.Sitemap = staticPaths.map((path) => ({
    url: `${origin}${path}`,
    changeFrequency: path === "" || path === "/catalog" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path === "/catalog" ? 0.9 : 0.6,
  }));

  try {
    const [categories, products, articles] = await Promise.all([
      getCategories(),
      getProductSitemapEntries(),
      getArticleSitemapEntries(),
    ]);
    result.push(
      ...categories.map((category) => ({
        url: `${origin}/catalog/${category.slug}`,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
      ...products.map((product) => ({
        url: `${origin}/catalog/${product.categorySlug}/${product.productSlug}`,
        lastModified: product.updatedAt
          ? new Date(product.updatedAt)
          : undefined,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
      ...articles.map((article) => ({
        url: `${origin}/articles/${article.slug}`,
        lastModified: article.updated_at
          ? new Date(article.updated_at)
          : undefined,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
    );
  } catch {
    // Static routes remain available when the CMS is temporarily offline.
  }
  return result;
}
