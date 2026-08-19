import { timingSafeEqual } from "node:crypto";
import { cookies, draftMode } from "next/headers";

import {
  PREVIEW_COOKIE_NAME,
  PREVIEW_COOKIE_TTL_SECONDS,
  DirectusRequestError,
  directusPreviewRequest,
  directusVersionedRequest,
  isUuid,
  signPreviewToken,
  type PreviewContext,
} from "@/lib/directus/client";

/**
 * Secure Live Preview entry point (Task 16).
 *
 * Contract:
 * - POST only, with the server-only PREVIEW_SECRET supplied via the
 *   `x-preview-secret` header. The secret never appears in URLs, query
 *   strings, cookies, responses or logs.
 * - The only user-supplied value that influences the outcome is the Directus
 *   version uuid in the JSON body. Redirect targets are ALWAYS constructed
 *   server-side from whitelisted per-collection route builders applied to the
 *   version's real item data; any `to`/`next`/`slug`-style parameter is
 *   ignored, which closes open redirects by construction.
 * - On success: Next.js draft mode is enabled, a short-lived HMAC-signed
 *   preview cookie ({ collection, id, version }) is set, and the response
 *   redirects (302) to the constructed path with `?version=` preserved for
 *   the render layer.
 */

// Mirrors the [infoSlug] route segment allowlist: a pages version may only be
// previewed on the informational route that actually renders it.
const informationSlugs = new Set([
  "about",
  "delivery",
  "contacts",
  "privacy-policy",
  "thank-you",
]);

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/iu;

type VersionRecord = {
  id: string;
  key: string | null;
  collection: string;
  item: string | null;
};

const SAFE_VERSION_KEY = /^[\w][\w.-]*$/u;

const forbidden = () =>
  Response.json({ ok: false, error: "Forbidden" }, { status: 403 });

const secretsMatch = (provided: string, secret: string) => {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(secret, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
};

const versionNotFound = () =>
  Response.json({ ok: false, error: "Version not found" }, { status: 404 });

/** Resolves the version's own slug so the preview URL always matches the draft. */
async function versionedSlug(
  collection: "articles" | "pages",
  item: string,
  versionKey: string,
): Promise<string | null> {
  const itemData = await directusVersionedRequest<{ slug?: unknown }>(
    `/items/${collection}/${item}?fields=slug`,
    { version: versionKey },
  );
  const slug = itemData?.slug;
  return typeof slug === "string" && SAFE_SLUG.test(slug) ? slug : null;
}

async function buildPreviewPath(
  record: VersionRecord,
  versionKey: string,
): Promise<string | null> {
  if (record.collection === "home_page") return "/";
  if (
    (record.collection !== "articles" && record.collection !== "pages") ||
    !isUuid(record.item)
  ) {
    return null;
  }
  const slug = await versionedSlug(record.collection, record.item, versionKey);
  if (!slug) return null;
  if (record.collection === "articles") {
    return `/articles/${encodeURIComponent(slug)}`;
  }
  return informationSlugs.has(slug) ? `/${slug}` : null;
}

export async function POST(request: Request) {
  const secret = process.env.PREVIEW_SECRET;
  if (!secret) return forbidden();
  const provided = request.headers.get("x-preview-secret");
  if (!provided || !secretsMatch(provided, secret)) return forbidden();

  let body: { version?: unknown };
  try {
    body = (await request.json()) as { version?: unknown };
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!isUuid(body.version)) {
    return Response.json({ ok: false, error: "Invalid version" }, { status: 400 });
  }
  const version = body.version;

  let record: VersionRecord | null;
  try {
    record = await directusPreviewRequest<VersionRecord>(
      `/versions/${version}?fields=id,key,collection,item`,
    );
  } catch (error) {
    if (
      error instanceof DirectusRequestError &&
      (error.status === 403 || error.status === 404)
    ) {
      return versionNotFound();
    }
    return Response.json({ ok: false, error: "Preview unavailable" }, { status: 502 });
  }
  if (!record || !isUuid(record.id)) {
    return versionNotFound();
  }
  if (record.collection !== "home_page" && !isUuid(record.item)) {
    return versionNotFound();
  }
  // Directus item reads resolve `?version=` by KEY, not by uuid — the key is
  // what the render layer and versionedSlug must send.
  const versionKey = record.key ?? "";
  if (!SAFE_VERSION_KEY.test(versionKey)) {
    return versionNotFound();
  }

  let path: string | null;
  try {
    path = await buildPreviewPath(record, versionKey);
  } catch (error) {
    if (error instanceof DirectusRequestError) {
      return versionNotFound();
    }
    return Response.json({ ok: false, error: "Preview unavailable" }, { status: 502 });
  }
  if (!path) return versionNotFound();

  const context: PreviewContext = {
    collection: record.collection as PreviewContext["collection"],
    id: record.item ?? record.id,
    version,
    versionKey,
  };

  const draft = await draftMode();
  draft.enable();
  const store = await cookies();
  store.set({
    name: PREVIEW_COOKIE_NAME,
    value: signPreviewToken(context, secret),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: PREVIEW_COOKIE_TTL_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });

  return new Response(null, {
    status: 302,
    headers: { Location: `${path}?version=${version}` },
  });
}
