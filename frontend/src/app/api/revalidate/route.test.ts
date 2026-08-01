import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag }));

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

  it("revalidates mapped tags using the max profile", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://site.test/api/revalidate", {
        method: "POST",
        headers: { "x-revalidate-secret": "test-secret" },
        body: JSON.stringify({ collection: "articles" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith("articles", "max");
    expect(revalidateTag).toHaveBeenCalledWith("homepage", "max");
    expect(revalidateTag).toHaveBeenCalledWith("sitemap", "max");
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
    expect(revalidateTag).toHaveBeenCalledWith("homepage", "max");
    expect(revalidateTag).toHaveBeenCalledWith("sitemap", "max");
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
    expect(revalidateTag).toHaveBeenCalledWith("navigation", "max");
    expect(revalidateTag).toHaveBeenCalledWith("homepage", "max");
  });
});
