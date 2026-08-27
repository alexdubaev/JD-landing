import { revalidatePath, revalidateTag } from "next/cache";

import { directusRequest, isUuid } from "@/lib/directus/client";
import { notifyIndexNow } from "@/lib/seo/indexnow";

const collectionTags = {
  articles: ["articles", "homepage", "sitemap"],
  categories: ["categories", "homepage", "sitemap"],
  products: ["products", "homepage", "sitemap"],
  pages: ["pages", "homepage", "sitemap"],
  faq_items: ["faq"],
  directus_files: ["files"],
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
  "home-page": ["homepage"],
  home_page: ["homepage"],
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
  faq_items: ["/"],
  directus_files: [],
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
  "home-page": ["/"],
  home_page: ["/"],
  homepage: ["/"],
  sitemap: ["/"],
} as const;

type Collection = keyof typeof collectionTags;

// Task 16 item-aware revalidation: when the payload identifies a concrete
// item, its exact public path(s) are invalidated in addition to (never instead
// of) the collection tags. Slug-based paths cover callers that know the old
// and/or new slug (a slug change invalidates BOTH); the id-based lookup
// resolves the item's current path server-side, which is the only way to
// build a product leaf path (it needs the category slug).
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/iu;

const slugPathBuilders: Partial<Record<Collection, (slug: string) => string>> =
  {
    articles: (slug) => `/articles/${slug}`,
    pages: (slug) => `/${slug}`,
    categories: (slug) => `/catalog/${slug}`,
  };

const itemLookupFields: Partial<Record<Collection, string>> = {
  articles: "slug",
  pages: "slug",
  categories: "slug",
  products: "slug,category.slug",
};

// Per-file cache tags used by the media proxy route (app/media/[fileId]).
// A replaced/renamed asset must expire these alongside the shared "files"
// tag, otherwise the CDN keeps serving stale bytes for up to a day. Keep the
// prefixes in sync with that route.
const FILE_TAG_PREFIXES = ["file", "section-image", "asset"] as const;

/**
 * Normalizes an optional item field. Directus flow templates render missing
 * trigger values as the literal string "undefined" (verified against the
 * 12.1.1 flow engine), and values that fail validation cannot build a safe
 * path — both are treated as "not provided" so the webhook stays reliable
 * across items.create / items.update / items.delete.
 */
const optionalItemValue = (
  value: unknown,
  isValid: (value: string) => boolean,
): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "undefined") return undefined;
  return isValid(trimmed) ? trimmed : undefined;
};

type ItemLookup = {
  slug?: unknown;
  category?: { slug?: unknown } | null;
};

async function resolveItemPaths(
  collection: Collection,
  id: string,
): Promise<string[]> {
  if (collection === "home_page") return ["/"];
  const fields = itemLookupFields[collection];
  if (!fields) return [];
  const item = await directusRequest<ItemLookup>(
    `/items/${collection}/${id}?fields=${encodeURIComponent(fields)}`,
    { cache: "no-store" },
  );
  const slug = optionalItemValue(item?.slug, (value) =>
    SAFE_SLUG.test(value),
  );
  if (!slug) return [];
  if (collection === "products") {
    const categorySlug = optionalItemValue(item?.category?.slug, (value) =>
      SAFE_SLUG.test(value),
    );
    return categorySlug ? [`/catalog/${categorySlug}/${slug}`] : [];
  }
  const build = slugPathBuilders[collection];
  return build ? [build(slug)] : [];
}

export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || request.headers.get("x-revalidate-secret") !== secret) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    collection?: unknown;
    id?: unknown;
    oldSlug?: unknown;
    newSlug?: unknown;
    tags?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
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

  // Task 16 optional item identification. Legacy `{ collection }` payloads
  // keep working identically: no item fields means no extra invalidation.
  const id = optionalItemValue(body.id, isUuid);
  const oldSlug = optionalItemValue(body.oldSlug, (value) =>
    SAFE_SLUG.test(value),
  );
  const newSlug = optionalItemValue(body.newSlug, (value) =>
    SAFE_SLUG.test(value),
  );
  if (
    body.tags !== undefined &&
    (!Array.isArray(body.tags) ||
      !body.tags.every(
        (tag) => typeof tag === "string" && tag.length > 0 && tag.length <= 100,
      ))
  ) {
    return Response.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }
  const extraTags = body.tags as string[] | undefined;
  extraTags?.forEach((tag) => revalidateTag(tag, { expire: 0 }));

  if (collection === "directus_files" && id) {
    for (const prefix of FILE_TAG_PREFIXES) {
      revalidateTag(`${prefix}:${id}`, { expire: 0 });
    }
  }

  const paths = new Set<string>();
  const buildSlugPath = slugPathBuilders[collection];
  for (const slug of [oldSlug, newSlug]) {
    if (slug && buildSlugPath) paths.add(buildSlugPath(slug));
  }
  // The id-based lookup fills in the exact current path when the payload has
  // no usable slug (regular saves) or when only the id can build the path
  // (products need their category slug).
  if (id && (paths.size === 0 || collection === "products")) {
    try {
      for (const path of await resolveItemPaths(collection, id)) {
        paths.add(path);
      }
    } catch {
      // Item lookup failed (for example right after a delete): the tag flush
      // above remains the safety net.
    }
  }
  paths.forEach((path) => revalidatePath(path));

  // Notify Yandex/Bing via IndexNow. Fire-and-forget after revalidation; any
  // error is swallowed inside notifyIndexNow so the webhook stays reliable.
  const indexNowPaths = collectionIndexNowPaths[collection];
  await notifyIndexNow([...indexNowPaths]);

  return Response.json({
    ok: true,
    collection,
    tags,
    paths: [...paths],
    indexNow: indexNowPaths,
  });
}
