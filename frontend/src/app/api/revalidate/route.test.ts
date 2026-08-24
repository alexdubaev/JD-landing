import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn();
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag, revalidatePath }));

const PRODUCT_ID = "1f0a7c92-33b1-4a1e-9c64-7089bb6c0000";
const ARTICLE_ID = "6b1e8d64-9c2f-4a57-b1e3-2f0f68a1f000";

const stubServerEnv = () => {
  vi.stubEnv("DIRECTUS_URL", "https://cms.example.test");
  vi.stubEnv("DIRECTUS_TOKEN", "server-token-for-tests-only");
  vi.stubEnv(
    "DIRECTUS_PUBLIC_FOLDER_ID",
    "1ecf70c5-0ad4-4e5e-8d73-78ee549f064a",
  );
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");
};

describe("POST /api/revalidate", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.REVALIDATE_SECRET = "test-secret";
  });

  it("rejects an invalid secret", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://site.test/api/revalidate", {
        method: "POST",
        headers: { "x-revalidate-secret": "wrong" },
        body: JSON.stringify({ collection: "articles" }),
      }),
    );
    expect(response.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("rejects collections outside the allowlist", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://site.test/api/revalidate", {
        method: "POST",
        headers: { "x-revalidate-secret": "test-secret" },
        body: JSON.stringify({ collection: "directus_users" }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("expires mapped tags immediately for an external CMS webhook", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://site.test/api/revalidate", {
        method: "POST",
        headers: { "x-revalidate-secret": "test-secret" },
        body: JSON.stringify({ collection: "articles" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith("articles", { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith("homepage", { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith("sitemap", { expire: 0 });
  });

  it("accepts direct homepage and sitemap invalidation tags", async () => {
    const { POST } = await import("./route");
    for (const collection of ["homepage", "sitemap"]) {
      const response = await POST(
        new Request("https://site.test/api/revalidate", {
          method: "POST",
          headers: { "x-revalidate-secret": "test-secret" },
          body: JSON.stringify({ collection }),
        }),
      );
      expect(response.status).toBe(200);
    }
    expect(revalidateTag).toHaveBeenCalledWith("homepage", { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith("sitemap", { expire: 0 });
  });

  it("revalidates the homepage singleton after an editor saves it", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://site.test/api/revalidate", {
        method: "POST",
        headers: { "x-revalidate-secret": "test-secret" },
        body: JSON.stringify({ collection: "home_page" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith("homepage", { expire: 0 });
  });

  it("revalidates the shared header after a navigation change", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://site.test/api/revalidate", {
        method: "POST",
        headers: { "x-revalidate-secret": "test-secret" },
        body: JSON.stringify({ collection: "navigation-items" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith("navigation", { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith("homepage", { expire: 0 });
  });

  it("allows company settings and recent supplies invalidation", async () => {
    const { POST } = await import("./route");
    for (const collection of ["site_settings", "recent_supplies"]) {
      const response = await POST(
        new Request("https://site.test/api/revalidate", {
          method: "POST",
          headers: { "x-revalidate-secret": "test-secret" },
          body: JSON.stringify({ collection }),
        }),
      );
      expect(response.status).toBe(200);
    }
    expect(revalidateTag).toHaveBeenCalledWith("site-settings", { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith("recent-supplies", { expire: 0 });
  });
});

describe("POST /api/revalidate item-aware payloads (Task 16)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.REVALIDATE_SECRET = "test-secret";
    stubServerEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("keeps legacy collection-only payloads working identically", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://site.test/api/revalidate", {
        method: "POST",
        headers: { "x-revalidate-secret": "test-secret" },
        body: JSON.stringify({ collection: "articles" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      collection: "articles",
      tags: ["articles", "homepage", "sitemap"],
      paths: [],
      indexNow: ["/articles"],
    });
    // Identical to the pre-Task-16 behaviour: tags only, no path
    // invalidation and no item lookup.
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(revalidateTag).toHaveBeenCalledWith("articles", { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith("homepage", { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith("sitemap", { expire: 0 });
  });

  it("invalidates both the old and the new path on a slug change", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://site.test/api/revalidate", {
        method: "POST",
        headers: { "x-revalidate-secret": "test-secret" },
        body: JSON.stringify({
          collection: "articles",
          id: ARTICLE_ID,
          oldSlug: "old-slug",
          newSlug: "new-slug",
        }),
      }),
    );

    expect(response.status).toBe(200);
    // Exact path set: old AND new paths, nothing else.
    expect(revalidatePath.mock.calls).toEqual([
      ["/articles/old-slug"],
      ["/articles/new-slug"],
    ]);
    expect(revalidateTag).toHaveBeenCalledWith("articles", { expire: 0 });
    // Slugs were provided, so no item lookup is needed.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves the exact path from the item id when no usable slug is sent", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              slug: "mufta-kompressora",
              category: { slug: "clutches" },
            },
          }),
        ),
      );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://site.test/api/revalidate", {
        method: "POST",
        headers: { "x-revalidate-secret": "test-secret" },
        body: JSON.stringify({
          collection: "products",
          // Directus renders missing trigger values as "undefined"; the
          // webhook treats that as "not provided".
          id: PRODUCT_ID,
          newSlug: "undefined",
        }),
      }),
    );

    expect(response.status).toBe(200);
    const lookupUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(lookupUrl.pathname).toBe(`/items/products/${PRODUCT_ID}`);
    expect(lookupUrl.searchParams.get("fields")).toBe("slug,category.slug");
    expect(revalidatePath.mock.calls).toEqual([
      ["/catalog/clutches/mufta-kompressora"],
    ]);
  });

  it("keeps the tag flush reliable when the item lookup fails after a delete", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("gone", { status: 404 }),
    );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://site.test/api/revalidate", {
        method: "POST",
        headers: { "x-revalidate-secret": "test-secret" },
        body: JSON.stringify({ collection: "articles", id: ARTICLE_ID }),
      }),
    );

    expect(response.status).toBe(200);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(revalidateTag).toHaveBeenCalledWith("articles", { expire: 0 });
  });

  it("revalidates the homepage path when the singleton id is sent", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://site.test/api/revalidate", {
        method: "POST",
        headers: { "x-revalidate-secret": "test-secret" },
        body: JSON.stringify({ collection: "home_page", id: PRODUCT_ID }),
      }),
    );

    expect(response.status).toBe(200);
    expect(revalidatePath.mock.calls).toEqual([["/"]]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("revalidates additional caller-provided tags and rejects malformed ones", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("https://site.test/api/revalidate", {
        method: "POST",
        headers: { "x-revalidate-secret": "test-secret" },
        body: JSON.stringify({ collection: "articles", tags: ["custom-tag"] }),
      }),
    );
    expect(response.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith("custom-tag", { expire: 0 });

    const invalid = await POST(
      new Request("https://site.test/api/revalidate", {
        method: "POST",
        headers: { "x-revalidate-secret": "test-secret" },
        body: JSON.stringify({ collection: "articles", tags: [42] }),
      }),
    );
    expect(invalid.status).toBe(400);
  });
});
