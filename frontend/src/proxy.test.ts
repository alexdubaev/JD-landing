import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { resetRateLimits } from "@/lib/security/rate-limit";
import { proxy, resolveRateLimitPolicy } from "./proxy";

afterEach(() => resetRateLimits());

describe("SEO proxy", () => {
  it("returns a 404 response before rendering an unknown top-level route", () => {
    const response = proxy(new NextRequest("https://deere-shop.ru/not-a-real-page"));

    expect(response?.status).toBe(404);
    expect(response?.headers.get("content-type")).toContain("text/html");
    expect(response?.headers.get("x-robots-tag")).toBe("noindex, follow");
  });
});

describe("API rate limiting", () => {
  it("limits lead submissions to five requests per window", () => {
    const request = () =>
      proxy(
        new NextRequest("https://deere-shop.ru/api/leads", {
          method: "POST",
          headers: { "x-forwarded-for": "203.0.113.8" },
        }),
      );

    for (let index = 0; index < 5; index += 1) {
      expect(request().status).not.toBe(429);
    }
    const blocked = request();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/u);
  });

  it("uses the shared unknown bucket for spoofed forwarded chains", () => {
    const request = (forwarded: string) =>
      proxy(
        new NextRequest("https://deere-shop.ru/api/revalidate", {
          method: "POST",
          headers: { "x-forwarded-for": forwarded },
        }),
      );

    for (let index = 0; index < 30; index += 1) {
      expect(request(`attacker-${index}, 10.0.0.1`).status).not.toBe(429);
    }
    expect(request("different-attacker, 10.0.0.1").status).toBe(429);
  });

  it("limits order submissions to ten requests per window", () => {
    const request = () =>
      proxy(
        new NextRequest("https://deere-shop.ru/api/orders", {
          method: "POST",
          headers: { "x-forwarded-for": "203.0.113.8" },
        }),
      );

    for (let index = 0; index < 10; index += 1) {
      expect(request().status).not.toBe(429);
    }
    expect(request().status).toBe(429);
  });
});

describe("resolveRateLimitPolicy", () => {
  it("limits the public suggest endpoint to 60 requests per minute", () => {
    expect(resolveRateLimitPolicy("/api/catalog/suggestions", "GET")).toEqual({
      limit: 60,
      windowMs: 60_000,
    });
  });

  it("limits media proxying generously so normal page loads still work", () => {
    for (const path of ["/media/", "/media/0f813216-1234-5678"]) {
      expect(resolveRateLimitPolicy(path, "GET")).toEqual({
        limit: 600,
        windowMs: 60_000,
      });
    }
  });

  it("does not limit pages, assets or mismatched methods", () => {
    for (const [path, method] of [
      ["/catalog", "GET"],
      ["/api/catalog/suggestions", "POST"],
      ["/api/leads", "GET"],
      ["/media/x", "POST"],
      ["/sitemap.xml", "GET"],
    ] as const) {
      expect(resolveRateLimitPolicy(path, method)).toBeNull();
    }
  });
});

describe("GET rate limiting for Directus-fanout routes", () => {
  it("returns 429 with Retry-After once the suggest budget is exhausted", async () => {
    const request = () =>
      proxy(
        new NextRequest("https://deere-shop.ru/api/catalog/suggestions?q=filter", {
          headers: { "x-forwarded-for": "203.0.113.7" },
        }),
      );

    let blocked: ReturnType<typeof proxy> | undefined;
    for (let index = 0; index < 61; index += 1) {
      blocked = request();
    }

    expect(blocked?.status).toBe(429);
    expect(Number(blocked?.headers.get("Retry-After"))).toBeGreaterThan(0);
    await expect(blocked?.json()).resolves.toEqual({ error: "Too many requests" });
  });

  it("tracks budgets per IP, so another client is not blocked", () => {
    for (let index = 0; index < 61; index += 1) {
      proxy(
        new NextRequest("https://deere-shop.ru/api/catalog/suggestions?q=x", {
          headers: { "x-forwarded-for": "203.0.113.7" },
        }),
      );
    }

    expect(
      proxy(
        new NextRequest("https://deere-shop.ru/api/catalog/suggestions?q=x", {
          headers: { "x-forwarded-for": "198.51.100.9" },
        }),
      ).status,
    ).toBe(200);
  });

  it("lets regular page loads through without a policy", () => {
    for (let index = 0; index < 700; index += 1) {
      expect(
        proxy(
          new NextRequest("https://deere-shop.ru/catalog", {
            headers: { "x-forwarded-for": "203.0.113.7" },
          }),
        ).status,
      ).not.toBe(429);
    }
  });
});
