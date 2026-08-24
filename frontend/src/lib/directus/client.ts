import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies, draftMode } from "next/headers";

import type { DirectusResponse } from "@/types/directus";

import { getServerEnv } from "./env";

type NextFetchOptions = {
  revalidate?: number | false;
  tags?: string[];
};

export type DirectusRequestInit = RequestInit & {
  next?: NextFetchOptions;
};

export class DirectusRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
  ) {
    super(`Directus request failed with HTTP ${status}`);
    this.name = "DirectusRequestError";
  }
}

const assertRelativeApiPath = (path: string) => {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new TypeError("Expected a relative Directus API path");
  }
};

export async function directusRequest<T>(
  path: string,
  init: DirectusRequestInit = {},
): Promise<T> {
  const response = await directusEnvelopeRequest<T>(path, init);
  return response.data;
}

export async function directusEnvelopeRequest<T>(
  path: string,
  init: DirectusRequestInit = {},
): Promise<DirectusResponse<T>> {
  assertRelativeApiPath(path);
  const environment = getServerEnv();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${environment.DIRECTUS_TOKEN}`);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${environment.DIRECTUS_URL}${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    throw new DirectusRequestError(response.status, path.split("?").at(0)!);
  }
  if (response.status === 204) {
    return { data: undefined as T };
  }

  return (await response.json()) as DirectusResponse<T>;
}

// ---------------------------------------------------------------------------
// Content-version preview (Task 16)
//
// Directus 12 versioned-read semantics (verified against the 12.1.1 source in
// the staging container): `GET /items/{collection}/{key}?version=<uuid>` serves
// the version delta; `versionRaw=true` makes it a purely read-only overlay
// (published item + delta merged, no transactional writes); the reserved keys
// "published"/"main" bypass versioning. Singleton collections resolve their
// primary key automatically, so `/items/home_page?version=…` works as-is.
// ---------------------------------------------------------------------------

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID_PATTERN.test(value);

export const PREVIEW_COOKIE_NAME = "jd_preview";
/** Preview cookies live 15 minutes; draft mode is exited via /api/preview/disable. */
export const PREVIEW_COOKIE_TTL_SECONDS = 15 * 60;

export type PreviewCollection = "articles" | "pages" | "home_page";

export type PreviewContext = {
  collection: PreviewCollection;
  id: string;
  /** Version uuid — identity of the validated Directus version. */
  version: string;
  /**
   * Version KEY (e.g. "draft"): Directus 12 `?version=` item reads resolve by
   * key, NOT by uuid — getVersionSaves filters `directus_versions.key`.
   */
  versionKey: string;
};

const previewCollections = new Set<PreviewCollection>([
  "articles",
  "pages",
  "home_page",
]);

type PreviewCookiePayload = PreviewContext & { exp: number };

export function signPreviewToken(
  context: PreviewContext,
  secret: string,
  now = Date.now(),
): string {
  const payload: PreviewCookiePayload = {
    ...context,
    exp: Math.floor(now / 1000) + PREVIEW_COOKIE_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const signature = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyPreviewToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): PreviewContext | null {
  if (!token || !secret) return null;
  const separator = token.indexOf(".");
  if (separator <= 0) return null;
  const encoded = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = createHmac("sha256", secret).update(encoded).digest();
  const provided = Buffer.from(signature, "base64url");
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const { collection, id, version, versionKey, exp } = payload as Record<
    string,
    unknown
  >;
  if (
    typeof collection !== "string" ||
    !previewCollections.has(collection as PreviewCollection) ||
    !isUuid(id) ||
    !isUuid(version) ||
    typeof versionKey !== "string" ||
    !/^[\w][\w.-]*$/u.test(versionKey) ||
    typeof exp !== "number" ||
    exp <= Math.floor(now / 1000)
  ) {
    return null;
  }
  return {
    collection: collection as PreviewCollection,
    id,
    version,
    versionKey,
  };
}

/**
 * Reads the validated preview context for version-aware renders. Requires all
 * of: Next.js draft mode enabled, the signed short-lived preview cookie, and
 * PREVIEW_SECRET on the server. Anything missing or malformed returns null,
 * which keeps the published render path byte-identical to the pre-preview
 * behaviour.
 */
export async function readPreviewContext(): Promise<PreviewContext | null> {
  const secret = process.env.PREVIEW_SECRET;
  if (!secret) return null;
  const draft = await draftMode();
  if (!draft.isEnabled) return null;
  const store = await cookies();
  return verifyPreviewToken(store.get(PREVIEW_COOKIE_NAME)?.value, secret);
}

const getPreviewToken = () => {
  const token = process.env.DIRECTUS_PREVIEW_TOKEN;
  if (!token) {
    throw new Error(
      "DIRECTUS_PREVIEW_TOKEN is not configured: content-version preview is unavailable",
    );
  }
  return token;
};

/**
 * Server-only request authenticated with the preview token (a Directus static
 * token provisioned at deploy time that may read `/versions` and versioned
 * items of the editorial collections). Falls back clearly — a missing env
 * throws instead of silently downgrading to the public frontend token. Like
 * every export of this module it is unreachable from client components
 * through the top `import "server-only"` guard.
 */
async function previewEnvelopeRequest<T>(
  path: string,
  init: DirectusRequestInit = {},
): Promise<DirectusResponse<T>> {
  assertRelativeApiPath(path);
  const environment = getServerEnv();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${getPreviewToken()}`);
  headers.set("Accept", "application/json");
  const response = await fetch(`${environment.DIRECTUS_URL}${path}`, {
    ...init,
    headers,
    // Draft previews must never be cached by the data cache.
    cache: init.cache ?? "no-store",
  });
  if (!response.ok) {
    throw new DirectusRequestError(response.status, path.split("?").at(0)!);
  }
  if (response.status === 204) {
    return { data: undefined as T };
  }
  return (await response.json()) as DirectusResponse<T>;
}

/** Preview-token GET that unwraps the data envelope (system reads, /versions). */
export async function directusPreviewRequest<T>(
  path: string,
  init: DirectusRequestInit = {},
): Promise<T> {
  const response = await previewEnvelopeRequest<T>(path, init);
  return response.data;
}

export type DirectusVersionedRequestInit = Omit<DirectusRequestInit, "next"> & {
  version: string;
};

/**
 * Version-aware item read: appends `version` + `versionRaw=true` to the given
 * items path and authenticates with the preview token. `next` cache tags are
 * stripped on purpose so a draft can never poison the ISR cache.
 */
export async function directusVersionedRequest<T>(
  path: string,
  { version, ...init }: DirectusVersionedRequestInit,
): Promise<T> {
  assertRelativeApiPath(path);
  // `version` here is the Directus version KEY (verified by
  // /api/preview against /versions/{uuid}); keys are editor-chosen
  // strings like "draft", not uuids.
  if (typeof version !== "string" || !/^[\w][\w.-]*$/u.test(version)) {
    throw new TypeError("Expected a version key for a versioned Directus request");
  }
  const [pathname, search = ""] = path.split("?");
  const parameters = new URLSearchParams(search);
  parameters.set("version", version);
  parameters.set("versionRaw", "true");
  const response = await previewEnvelopeRequest<T>(
    `${pathname}?${parameters.toString()}`,
    init,
  );
  return response.data;
}
