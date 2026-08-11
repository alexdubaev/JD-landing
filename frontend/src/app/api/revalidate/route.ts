import { revalidateTag } from "next/cache";

import { notifyIndexNow } from "@/lib/seo/indexnow";
import { requireProductionSecret, safeEqual } from "@/lib/security/secrets";

const collectionTags = {
  articles: ["articles", "homepage", "sitemap"],
  categories: ["categories", "homepage", "sitemap"],
  products: ["products", "homepage", "sitemap"],
  pages: ["pages", "homepage", "sitemap"],
  "page-sections": ["page-sections", "homepage"],
  page_sections: ["page-sections", "homepage"],
  "navigation-items": ["navigation", "homepage"],
  navigation_items: ["navigation", "homepage"],
  "contact-channels": ["contact-channels", "homepage"],
  contact_channels: ["contact-channels", "homepage"],
  "site-settings": ["site-settings", "homepage"],
  site_settings: ["site-settings", "homepage"],
  "recent-supplies": ["recent-supplies", "homepage"],
  recent_supplies: ["recent-supplies", "homepage"],
  orders: ["orders"],
  homepage: ["homepage"],
  sitemap: ["sitemap"],
} as const;

// IndexNow re-ping map: which top-level paths to notify when a collection
// changes. Yandex re-crawls the pinged URLs and discovers the updated child
// pages (product/article detail) via the changed listing.
const collectionIndexNowPaths = {
  articles: ["/articles"],
  categories: ["/catalog"],
  products: ["/catalog"],
  pages: ["/"],
  "page-sections": ["/"],
  page_sections: ["/"],
  "navigation-items": ["/"],
  navigation_items: ["/"],
  "contact-channels": ["/"],
  contact_channels: ["/"],
  "site-settings": ["/"],
  site_settings: ["/"],
  "recent-supplies": ["/"],
  recent_supplies: ["/"],
  orders: [],
  homepage: ["/"],
  sitemap: ["/"],
} as const;

type Collection = keyof typeof collectionTags;

export async function POST(request: Request) {
  let secret: string | undefined;
  try {
    secret = requireProductionSecret(
      "REVALIDATE_SECRET",
      process.env.REVALIDATE_SECRET,
      32,
    );
  } catch {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!secret || !safeEqual(request.headers.get("x-revalidate-secret"), secret)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { collection?: unknown };
  try {
    body = (await request.json()) as { collection?: unknown };
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (
    typeof body.collection !== "string" ||
    !(body.collection in collectionTags)
  ) {
    return Response.json(
      { ok: false, error: "Collection is not allowed" },
      { status: 400 },
    );
  }

  const collection = body.collection as Collection;
  const tags = collectionTags[collection];
  // CMS webhooks must expire the cache before deploy warm-up. The "max"
  // profile serves stale content first, so it cannot guarantee fresh pages.
  tags.forEach((tag) => revalidateTag(tag, { expire: 0 }));

  // Notify Yandex/Bing via IndexNow. Fire-and-forget after revalidation; any
  // error is swallowed inside notifyIndexNow so the webhook stays reliable.
  const indexNowPaths = collectionIndexNowPaths[collection];
  await notifyIndexNow([...indexNowPaths]);

  return Response.json({ ok: true, collection, tags, indexNow: indexNowPaths });
}
