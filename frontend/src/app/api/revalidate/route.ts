import { revalidateTag } from "next/cache";

const collectionTags = {
  articles: ["articles", "homepage", "sitemap"],
  categories: ["categories", "homepage", "sitemap"],
  products: ["products", "homepage", "sitemap"],
  pages: ["pages", "homepage", "sitemap"],
  "contact-channels": ["contact-channels", "homepage"],
  contact_channels: ["contact-channels", "homepage"],
  homepage: ["homepage"],
  sitemap: ["sitemap"],
} as const;

type Collection = keyof typeof collectionTags;

export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || request.headers.get("x-revalidate-secret") !== secret) {
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

  const tags = collectionTags[body.collection as Collection];
  tags.forEach((tag) => revalidateTag(tag, "max"));
  return Response.json({ ok: true, collection: body.collection, tags });
}
