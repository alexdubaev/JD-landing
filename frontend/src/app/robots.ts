import type { MetadataRoute } from "next";

import { siteOrigin } from "@/lib/seo/url";

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/thank-you", "/parts-request"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}