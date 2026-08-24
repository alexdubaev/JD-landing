import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { resetRateLimits } from "@/lib/security/rate-limit";
import { proxy } from "./proxy";

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
