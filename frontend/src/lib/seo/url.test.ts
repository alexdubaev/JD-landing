import { afterEach, describe, expect, it, vi } from "vitest";

import { absoluteUrl, absoluteUrlWithQuery, siteOrigin } from "./url";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllEnvs();
});

describe("siteOrigin", () => {
  it("falls back to the production origin when the env var is unset", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(siteOrigin()).toBe("https://deere-shop.ru");
  });

  it("uses the configured origin and trims trailing slashes", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.example.test//";
    expect(siteOrigin()).toBe("https://staging.example.test");
  });
});

describe("absoluteUrl", () => {
  it("prefixes relative paths with a slash", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
    expect(absoluteUrl("catalog/tractors")).toBe(
      "https://example.test/catalog/tractors",
    );
  });

  it("keeps absolute site paths intact", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
    expect(absoluteUrl("/catalog/tractors")).toBe(
      "https://example.test/catalog/tractors",
    );
  });
});

describe("absoluteUrlWithQuery", () => {
  it("drops undefined and empty params and keeps the rest", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
    const url = absoluteUrlWithQuery("/catalog", {
      category: "tractors",
      page: 2,
      empty: "",
      missing: undefined,
    });
    expect(url).toBe("https://example.test/catalog?category=tractors&page=2");
  });

  it("omits the question mark when no params survive", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
    expect(absoluteUrlWithQuery("/catalog", { empty: "" })).toBe(
      "https://example.test/catalog",
    );
  });
});
