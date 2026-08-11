import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag }));

const validSecret = "a".repeat(32);

describe("POST /api/revalidate", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.REVALIDATE_SECRET = validSecret;
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

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a configured secret shorter than 32 characters", async () => {
    process.env.REVALIDATE_SECRET = "test-secret";
    vi.stubEnv("NODE_ENV", "production");
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://site.test/api/revalidate", {
        method: "POST",
        headers: { "x-revalidate-secret": "test-secret" },
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
        headers: { "x-revalidate-secret": validSecret },
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
        headers: { "x-revalidate-secret": validSecret },
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
          headers: { "x-revalidate-secret": validSecret },
          body: JSON.stringify({ collection }),
        }),
      );
      expect(response.status).toBe(200);
    }
    expect(revalidateTag).toHaveBeenCalledWith("homepage", { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith("sitemap", { expire: 0 });
  });

  it("revalidates the shared header after a navigation change", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://site.test/api/revalidate", {
        method: "POST",
        headers: { "x-revalidate-secret": validSecret },
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
          headers: { "x-revalidate-secret": validSecret },
          body: JSON.stringify({ collection }),
        }),
      );
      expect(response.status).toBe(200);
    }
    expect(revalidateTag).toHaveBeenCalledWith("site-settings", { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith("recent-supplies", { expire: 0 });
  });
});
