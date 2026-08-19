import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PreviewContext } from "@/lib/directus/client";

// Hoisted next/headers mock: the route (and the server-only client module it
// imports) must never touch a real request context in unit tests.
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
  verifyPreviewToken,
} from "@/lib/directus/client";

const PREVIEW_SECRET = "preview-secret-value-for-tests";
const VERSION_ID = "6b1e8d64-9c2f-4a57-b1e3-2f0f68a1f000";
const VERSION_KEY = "r12-draft";
const ARTICLE_ITEM = "1f0a7c92-33b1-4a1e-9c64-7089bb6c0000";

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

const previewRequest = (body: unknown, search = "", headers: HeadersInit = {}) =>
  new Request(`https://example.test/api/preview${search}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const versionsResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), { status });

describe("POST /api/preview", () => {
  beforeEach(() => {
    stubEnv();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("enables draft mode, sets the signed preview cookie and redirects to the article draft path", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        versionsResponse({
          id: VERSION_ID,
          key: VERSION_KEY,
          collection: "articles",
          item: ARTICLE_ITEM,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { slug: "draft-slug" } })),
      );

    const response = await POST(
      previewRequest({ version: VERSION_ID }, "", {
        "x-preview-secret": PREVIEW_SECRET,
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      `/articles/draft-slug?version=${VERSION_ID}`,
    );
    expect(headersMock.draft.enable).toHaveBeenCalledTimes(1);

    // The version lookup runs with the preview token, never the public one.
    const [firstUrl, firstInit] = fetchMock.mock.calls[0];
    expect(String(firstUrl)).toBe(
      `https://cms.example.test/versions/${VERSION_ID}?fields=id,key,collection,item`,
    );
    expect(new Headers(firstInit?.headers).get("Authorization")).toBe(
      "Bearer preview-token-for-tests-only",
    );
    // The draft slug is read through the version-aware overlay.
    const [secondUrl] = fetchMock.mock.calls[1];
    expect(String(secondUrl)).toContain(
      `/items/articles/${ARTICLE_ITEM}?fields=slug&version=${VERSION_KEY}&versionRaw=true`,
    );

    const cookie = headersMock.store.set.mock.calls[0][0];
    expect(cookie.name).toBe(PREVIEW_COOKIE_NAME);
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.maxAge).toBe(900);
    expect(cookie.path).toBe("/");
    expect(
      verifyPreviewToken(cookie.value, PREVIEW_SECRET),
    ).toEqual<PreviewContext>({
      collection: "articles",
      id: ARTICLE_ITEM,
      version: VERSION_ID,
      versionKey: VERSION_KEY,
    });
  });

  it("redirects a pages version to its whitelisted informational route", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        versionsResponse({
          id: VERSION_ID,
          key: VERSION_KEY,
          collection: "pages",
          item: ARTICLE_ITEM,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { slug: "delivery" } })),
      );

    const response = await POST(
      previewRequest({ version: VERSION_ID }, "", {
        "x-preview-secret": PREVIEW_SECRET,
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      `/delivery?version=${VERSION_ID}`,
    );
  });

  it("rejects a pages version whose slug has no informational route", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        versionsResponse({
          id: VERSION_ID,
          key: VERSION_KEY,
          collection: "pages",
          item: ARTICLE_ITEM,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { slug: "not-a-page" } })),
      );

    const response = await POST(
      previewRequest({ version: VERSION_ID }, "", {
        "x-preview-secret": PREVIEW_SECRET,
      }),
    );

    expect(response.status).toBe(404);
    expect(headersMock.draft.enable).not.toHaveBeenCalled();
    expect(headersMock.store.set).not.toHaveBeenCalled();
  });

  it("previews the home_page singleton at the root route without a slug lookup", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      versionsResponse({
        id: VERSION_ID,
        key: VERSION_KEY,
        collection: "home_page",
        item: ARTICLE_ITEM,
      }),
    );

    const response = await POST(
      previewRequest({ version: VERSION_ID }, "", {
        "x-preview-secret": PREVIEW_SECRET,
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(`/?version=${VERSION_ID}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      verifyPreviewToken(headersMock.store.set.mock.calls[0][0].value, PREVIEW_SECRET),
    ).toEqual<PreviewContext>({
      collection: "home_page",
      id: ARTICLE_ITEM,
      version: VERSION_ID,
      versionKey: VERSION_KEY,
    });
  });

  it("rejects an unknown version with a 404 JSON response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not found", { status: 404 }),
    );

    const response = await POST(
      previewRequest({ version: VERSION_ID }, "", {
        "x-preview-secret": PREVIEW_SECRET,
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Version not found",
    });
    expect(headersMock.draft.enable).not.toHaveBeenCalled();
  });

  it("rejects a version of a collection that has no preview route", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      versionsResponse({
        id: VERSION_ID,
        key: VERSION_KEY,
        collection: "products",
        item: ARTICLE_ITEM,
      }),
    );

    const response = await POST(
      previewRequest({ version: VERSION_ID }, "", {
        "x-preview-secret": PREVIEW_SECRET,
      }),
    );

    expect(response.status).toBe(404);
    expect(headersMock.store.set).not.toHaveBeenCalled();
  });

  it("rejects a wrong or missing secret without touching Directus", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    for (const headers of [
      { "x-preview-secret": "wrong-secret" },
      {},
    ] as Array<HeadersInit>) {
      const response = await POST(previewRequest({ version: VERSION_ID }, "", headers));
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        ok: false,
        error: "Forbidden",
      });
    }

    expect(fetchMock).not.toHaveBeenCalled();
    expect(headersMock.draft.enable).not.toHaveBeenCalled();
  });

  it("rejects a malformed version id before any Directus access", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await POST(
      previewRequest({ version: "https://evil.test" }, "", {
        "x-preview-secret": PREVIEW_SECRET,
      }),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores user-supplied redirect destinations (open-redirect rejection)", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        versionsResponse({
          id: VERSION_ID,
          key: VERSION_KEY,
          collection: "articles",
          item: ARTICLE_ITEM,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { slug: "draft-slug" } })),
      );

    const response = await POST(
      previewRequest(
        {
          version: VERSION_ID,
          to: "https://evil.test",
          next: "//evil.test",
          slug: "attacker-slug",
        },
        "?to=https%3A%2F%2Fevil.test&next=%2F%2Fevil.test",
        { "x-preview-secret": PREVIEW_SECRET },
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      `/articles/draft-slug?version=${VERSION_ID}`,
    );
  });

  it("never echoes the secret in responses, cookies or logs", async () => {
    const consoleSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not found", { status: 404 }),
    );

    const response = await POST(
      previewRequest({ version: VERSION_ID }, "", {
        "x-preview-secret": PREVIEW_SECRET,
      }),
    );

    const responseText = await response.clone().text();
    const headersText = [...response.headers.entries()].toString();
    const cookieValues = JSON.stringify(
      headersMock.store.set.mock.calls.map((call) => call[0]),
    );
    const logged = consoleSpy.mock.calls.toString();

    expect(responseText).not.toContain(PREVIEW_SECRET);
    expect(headersText).not.toContain(PREVIEW_SECRET);
    expect(cookieValues).not.toContain(PREVIEW_SECRET);
    expect(logged).not.toContain(PREVIEW_SECRET);
  });
});
