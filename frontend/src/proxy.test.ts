import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "./proxy";

describe("SEO proxy", () => {
  it("returns a 404 response before rendering an unknown top-level route", () => {
    const response = proxy(new NextRequest("https://deere-shop.ru/not-a-real-page"));

    expect(response?.status).toBe(404);
    expect(response?.headers.get("content-type")).toContain("text/html");
    expect(response?.headers.get("x-robots-tag")).toBe("noindex, follow");
  });
});
