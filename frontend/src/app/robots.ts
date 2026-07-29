import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const origin = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://deere-shop.ru"
  ).replace(/\/+$/u, "");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/thank-you"],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
