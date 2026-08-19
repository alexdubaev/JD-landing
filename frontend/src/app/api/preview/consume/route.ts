import { cookies, draftMode } from "next/headers";

import {
  PREVIEW_COOKIE_NAME,
  PREVIEW_COOKIE_TTL_SECONDS,
  directusVersionedRequest,
  verifyPreviewToken,
  type PreviewContext,
} from "@/lib/directus/client";

const informationSlugs = new Set([
  "about",
  "delivery",
  "contacts",
  "privacy-policy",
  "thank-you",
]);
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/iu;

async function buildPreviewPath(context: PreviewContext): Promise<string | null> {
  if (context.collection === "home_page") return "/";
  const item = await directusVersionedRequest<{ slug?: unknown }>(
    `/items/${context.collection}/${context.id}?fields=slug`,
    { version: context.versionKey },
  );
  const slug = item?.slug;
  if (typeof slug !== "string" || !SAFE_SLUG.test(slug)) return null;
  if (context.collection === "articles") return `/articles/${encodeURIComponent(slug)}`;
  return informationSlugs.has(slug) ? `/${slug}` : null;
}

const forbidden = () =>
  Response.json({ ok: false, error: "Forbidden" }, { status: 403 });

/**
 * Receives a short-lived HMAC token through a server-rendered Directus form.
 * The token is intentionally form-only: it cannot be copied to a page URL,
 * sent as a Referer to assets, or persisted in web-server request logs.
 */
export async function POST(request: Request) {
  const secret = process.env.PREVIEW_SECRET;
  if (!secret) return forbidden();

  let token: string | null = null;
  try {
    const form = await request.formData();
    const value = form.get("token");
    token = typeof value === "string" ? value : null;
  } catch {
    return forbidden();
  }
  const context = verifyPreviewToken(token ?? undefined, secret);
  if (!context) return forbidden();

  let path: string | null;
  try {
    path = await buildPreviewPath(context);
  } catch {
    return forbidden();
  }
  if (!path) return forbidden();

  const draft = await draftMode();
  draft.enable();
  const store = await cookies();
  store.set({
    name: PREVIEW_COOKIE_NAME,
    value: token!,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: PREVIEW_COOKIE_TTL_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });

  return new Response(null, { status: 302, headers: { Location: path } });
}
