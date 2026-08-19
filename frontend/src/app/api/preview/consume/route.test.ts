import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PreviewContext } from "@/lib/directus/client";

const headersMock = vi.hoisted(() => {
  const draft = { isEnabled: false, enable: vi.fn(), disable: vi.fn() };
  const store = { set: vi.fn(), get: vi.fn(), delete: vi.fn() };
  return {
    draft,
    store,
    draftMode: vi.fn(async () => draft),
    cookies: vi.fn(async () => store),
  };
});
vi.mock("next/headers", () => ({
  draftMode: headersMock.draftMode,
  cookies: headersMock.cookies,
}));

import { POST } from "./route";
import {
  PREVIEW_COOKIE_NAME,
  signPreviewToken,
  verifyPreviewToken,
} from "@/lib/directus/client";

const PREVIEW_SECRET = "preview-secret-value-for-tests";
const VERSION_ID = "6b1e8d64-9c2f-4a57-b1e3-2f0f68a1f000";
const ARTICLE_ITEM = "1f0a7c92-33b1-4a1e-9c64-7089bb6c0000";
const context: PreviewContext = {
  collection: "articles",
  id: ARTICLE_ITEM,
  version: VERSION_ID,
  versionKey: "r12-draft",
};

const stubEnv = () => {
  vi.stubEnv("PREVIEW_SECRET", PREVIEW_SECRET);
  vi.stubEnv("DIRECTUS_PREVIEW_TOKEN", "preview-token-for-tests-only");
  vi.stubEnv("DIRECTUS_URL", "https://cms.example.test");
  vi.stubEnv("DIRECTUS_TOKEN", "server-token-for-tests-only");
  vi.stubEnv(
    "DIRECTUS_PUBLIC_FOLDER_ID",
    "1ecf70c5-0ad4-4e5e-8d73-78ee549f064a",
  );
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");
};

const consumeRequest = (token?: string) => {
  const body = new URLSearchParams();
  if (token) body.set("token", token);
  return new Request("https://example.test/api/preview/consume", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
};

describe("POST /api/preview/consume", () => {
  beforeEach(() => {
    stubEnv();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("accepts a signed form token, sets draft cookies and redirects without preview data in the URL", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { slug: "draft-slug" } })),
    );

    const response = await POST(
      consumeRequest(signPreviewToken(context, PREVIEW_SECRET)),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/articles/draft-slug");
    expect(headersMock.draft.enable).toHaveBeenCalledTimes(1);
    const cookie = headersMock.store.set.mock.calls[0][0];
    expect(cookie.name).toBe(PREVIEW_COOKIE_NAME);
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("lax");
    expect(verifyPreviewToken(cookie.value, PREVIEW_SECRET)).toEqual(context);

    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(String(url)).toContain(
      `/items/articles/${ARTICLE_ITEM}?fields=slug&version=r12-draft&versionRaw=true`,
    );
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer preview-token-for-tests-only",
    );
  });

  it("rejects missing or tampered form tokens before setting draft mode", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    for (const token of [undefined, "not-a-signed-token", `${signPreviewToken(context, PREVIEW_SECRET)}x`]) {
      const response = await POST(consumeRequest(token));
      expect(response.status).toBe(403);
    }

    expect(headersMock.draft.enable).not.toHaveBeenCalled();
    expect(headersMock.store.set).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
