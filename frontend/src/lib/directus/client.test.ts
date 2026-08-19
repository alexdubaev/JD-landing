import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

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

import {
  directusRequest,
  directusVersionedRequest,
  DirectusRequestError,
  PREVIEW_COOKIE_NAME,
  readPreviewContext,
  signPreviewToken,
  verifyPreviewToken,
  type PreviewContext,
} from "./client";

describe("directusRequest", () => {
  beforeEach(() => {
    vi.stubEnv("DIRECTUS_URL", "https://cms.example.test");
    vi.stubEnv("DIRECTUS_TOKEN", "server-token-for-tests-only");
    vi.stubEnv(
      "DIRECTUS_PUBLIC_FOLDER_ID",
      "1ecf70c5-0ad4-4e5e-8d73-78ee549f064a",
    );
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("authenticates a server-side request and unwraps the data envelope", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: "product-id" }] })),
      );

    const result = await directusRequest<Array<{ id: string }>>(
      "/items/products?filter[status][_eq]=published",
    );

    expect(result).toEqual([{ id: "product-id" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://cms.example.test/items/products?filter[status][_eq]=published",
    );
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer server-token-for-tests-only",
    );
  });

  it("throws a safe typed error without exposing the token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("upstream details", { status: 503 }),
    );

    await expect(directusRequest("/items/products")).rejects.toEqual(
      expect.objectContaining<Partial<DirectusRequestError>>({
        name: "DirectusRequestError",
        status: 503,
      }),
    );

    try {
      await directusRequest("/items/products");
    } catch (error) {
      expect(String(error)).not.toContain("server-token-for-tests-only");
      expect(String(error)).not.toContain("upstream details");
    }
  });

  it("rejects absolute paths so a token cannot leak to another origin", async () => {
    await expect(
      directusRequest("https://attacker.example/items"),
    ).rejects.toThrow(/relative Directus API path/i);
  });
});

describe("directusVersionedRequest", () => {
  beforeEach(() => {
    vi.stubEnv("DIRECTUS_URL", "https://cms.example.test");
    vi.stubEnv("DIRECTUS_TOKEN", "server-token-for-tests-only");
    vi.stubEnv(
      "DIRECTUS_PUBLIC_FOLDER_ID",
      "1ecf70c5-0ad4-4e5e-8d73-78ee549f064a",
    );
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");
    vi.stubEnv("DIRECTUS_PREVIEW_TOKEN", "preview-token-for-tests-only");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("appends the version overlay params and authenticates with the preview token", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ data: { slug: "draft-slug" } })),
      );

    const result = await directusVersionedRequest<{ slug: string }>(
      "/items/articles/1f0a7c92-33b1-4a1e-9c64-7089bb6c0000?fields=slug",
      { version: "r12-draft" },
    );

    expect(result).toEqual({ slug: "draft-slug" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "https://cms.example.test/items/articles/1f0a7c92-33b1-4a1e-9c64-7089bb6c0000" +
        "?fields=slug&version=r12-draft&versionRaw=true",
    );
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer preview-token-for-tests-only",
    );
    // Draft previews are never cached.
    expect(init?.cache).toBe("no-store");
  });

  it("throws a clear error and never fetches when the preview token env is missing", async () => {
    vi.stubEnv("DIRECTUS_PREVIEW_TOKEN", "");
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      directusVersionedRequest("/items/articles/1f0a7c92-33b1-4a1e-9c64-7089bb6c0000", {
        version: "r12-draft",
      }),
    ).rejects.toThrow(/DIRECTUS_PREVIEW_TOKEN/u);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unsafe version key before any request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      directusVersionedRequest("/items/articles/some-id", {
        version: "../versions/other",
      }),
    ).rejects.toThrow(/version key/u);
    await expect(
      directusVersionedRequest("/items/articles/some-id", { version: "" }),
    ).rejects.toThrow(/version key/u);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

const previewContext: PreviewContext = {
  collection: "articles",
  id: "1f0a7c92-33b1-4a1e-9c64-7089bb6c0000",
  version: "6b1e8d64-9c2f-4a57-b1e3-2f0f68a1f000",
  versionKey: "r12-draft",
};

describe("preview cookie tokens", () => {
  it("round-trips a signed preview context", () => {
    const token = signPreviewToken(previewContext, "preview-secret");

    expect(verifyPreviewToken(token, "preview-secret")).toEqual(previewContext);
  });

  it("rejects tampered tokens, wrong secrets and expired tokens", () => {
    const token = signPreviewToken(previewContext, "preview-secret");
    const tampered = `${token.slice(0, -2)}aa`;

    expect(verifyPreviewToken(tampered, "preview-secret")).toBeNull();
    expect(verifyPreviewToken(token, "other-secret")).toBeNull();
    expect(verifyPreviewToken(undefined, "preview-secret")).toBeNull();
    // Expired one millisecond past the TTL.
    const expired = signPreviewToken(
      previewContext,
      "preview-secret",
      Date.now() - 15 * 60 * 1000 - 1,
    );
    expect(verifyPreviewToken(expired, "preview-secret")).toBeNull();
  });
});

describe("readPreviewContext", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    headersMock.draft.isEnabled = false;
    headersMock.store.get.mockReturnValue(undefined);
  });

  it("requires draft mode, the secret and a valid signed cookie", async () => {
    vi.stubEnv("PREVIEW_SECRET", "preview-secret");
    const token = signPreviewToken(previewContext, "preview-secret");

    // Draft mode disabled: cookie alone is not enough.
    headersMock.draft.isEnabled = false;
    headersMock.store.get.mockReturnValue({
      name: PREVIEW_COOKIE_NAME,
      value: token,
    });
    expect(await readPreviewContext()).toBeNull();

    // Draft mode enabled but cookie missing.
    headersMock.draft.isEnabled = true;
    headersMock.store.get.mockReturnValue(undefined);
    expect(await readPreviewContext()).toBeNull();

    // Both present and valid.
    headersMock.store.get.mockReturnValue({
      name: PREVIEW_COOKIE_NAME,
      value: token,
    });
    expect(await readPreviewContext()).toEqual(previewContext);
  });

  it("returns null without PREVIEW_SECRET so published renders stay untouched", async () => {
    vi.stubEnv("PREVIEW_SECRET", "");
    headersMock.draft.isEnabled = true;
    headersMock.store.get.mockReturnValue({
      name: PREVIEW_COOKIE_NAME,
      value: signPreviewToken(previewContext, "other-secret"),
    });

    expect(await readPreviewContext()).toBeNull();
  });
});

describe("server-only module graph", () => {
  it("keeps the versioned request in the server-only module like directusRequest", async () => {
    const source = await readFile(
      resolve(process.cwd(), "src/lib/directus/client.ts"),
      "utf8",
    );

    // The module is guarded by `import "server-only"` (aliased to a throwing
    // stub outside of vitest) and never carries a "use client" directive, so
    // directusVersionedRequest cannot be pulled into a client bundle.
    expect(source).toMatch(/^import "server-only";/u);
    expect(source).not.toMatch(/["']use client["']/u);
  });
});
