import type { MetadataRoute } from "next";

import { siteOrigin } from "@/lib/seo/url";

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}