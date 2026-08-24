import { describe, expect, it } from "vitest";

import {
  parseSeoJson,
  resolveSeo,
  type SeoFallback,
} from "./directus-seo";

const scalarFallback: SeoFallback = {
  title: "Скалярный заголовок",
  description: "Скалярное описание",
  canonical: "https://deere-shop.test/scalar",
  ogImageFileId: "scalar-og-uuid",
  noIndex: true,
};

describe("parseSeoJson", () => {
  it("accepts only JSON objects and degrades everything else to null", () => {
    expect(parseSeoJson({ title: "T" })).toEqual({ title: "T" });
    expect(parseSeoJson(null)).toBeNull();
    expect(parseSeoJson(undefined)).toBeNull();
    expect(parseSeoJson("garbage string")).toBeNull();
    expect(parseSeoJson('{"title":"parsed"}')).toBeNull();
    expect(parseSeoJson([1, 2])).toBeNull();
    expect(parseSeoJson(42)).toBeNull();
  });
});

describe("resolveSeo — scalar-fallback path (seo empty)", () => {
  it.each([
    ["seo null", { seo: null }],
    ["seo undefined", {}],
    ["seo empty object", { seo: {} }],
    ["seo garbage string", { seo: "garbage string" }],
    ["seo array", { seo: [{ title: "x" }] }],
    ["seo number", { seo: 7 }],
  ])("resolves every key from the scalars for %s", (_name, item) => {
    expect(resolveSeo(item, scalarFallback)).toEqual({
      title: "Скалярный заголовок",
      description: "Скалярное описание",
      canonical: "https://deere-shop.test/scalar",
      ogImageFileId: "scalar-og-uuid",
      noIndex: true,
      noFollow: false,
      sitemap: null,
      source: "scalar",
    });
  });

  it("passes the scalar values through unchanged (empty strings included)", () => {
    const resolved = resolveSeo(
      { seo: null },
      { title: "", description: null },
    );
    expect(resolved.title).toBe("");
    expect(resolved.description).toBeNull();
    expect(resolved.source).toBe("scalar");
  });

  it("reports source=default when neither side provides any value", () => {
    expect(resolveSeo({ seo: null }, {})).toEqual({
      title: null,
      description: null,
      canonical: null,
      ogImageFileId: null,
      noIndex: false,
      noFollow: false,
      sitemap: null,
      source: "default",
    });
    expect(resolveSeo(null)).toEqual(
      expect.objectContaining({ source: "default" }),
    );
    expect(resolveSeo(undefined, { title: null, noIndex: null })).toEqual(
      expect.objectContaining({ source: "default", noIndex: false }),
    );
  });
});

describe("resolveSeo — JSON-first path", () => {
  it("JSON wins over conflicting scalars for every key", () => {
    const resolved = resolveSeo(
      {
        seo: {
          title: "JSON-заголовок",
          meta_description: "JSON-описание",
          og_image: "json-og-uuid",
          additional_fields: { canonical_url: "https://deere-shop.test/json" },
          no_index: true,
          no_follow: true,
        },
      },
      scalarFallback,
    );

    expect(resolved).toEqual({
      title: "JSON-заголовок",
      description: "JSON-описание",
      canonical: "https://deere-shop.test/json",
      ogImageFileId: "json-og-uuid",
      noIndex: true,
      noFollow: true,
      sitemap: null,
      source: "json",
    });
  });

  it("a partial JSON merges with the scalars per key", () => {
    const resolved = resolveSeo(
      { seo: { title: "  ", meta_description: "Только описание" } },
      scalarFallback,
    );

    // title is whitespace-only in the JSON — falls back per key.
    expect(resolved.title).toBe("Скалярный заголовок");
    expect(resolved.description).toBe("Только описание");
    expect(resolved.canonical).toBe("https://deere-shop.test/scalar");
    expect(resolved.ogImageFileId).toBe("scalar-og-uuid");
    expect(resolved.noIndex).toBe(true);
    expect(resolved.source).toBe("json");
  });

  it("wrong-typed JSON keys fall back for that key only and never throw", () => {
    const resolved = resolveSeo(
      {
        seo: {
          title: 123,
          meta_description: { text: "нет" },
          og_image: 999,
          additional_fields: "not-an-object",
          no_index: "yes",
          no_follow: 1,
          sitemap: "weekly",
        },
      },
      scalarFallback,
    );

    expect(resolved.title).toBe("Скалярный заголовок");
    expect(resolved.description).toBe("Скалярное описание");
    expect(resolved.ogImageFileId).toBe("scalar-og-uuid");
    expect(resolved.canonical).toBe("https://deere-shop.test/scalar");
    expect(resolved.noIndex).toBe(true);
    expect(resolved.noFollow).toBe(false);
    expect(resolved.sitemap).toBeNull();
    // Every JSON key was invalid — the scalars carried everything.
    expect(resolved.source).toBe("scalar");
  });

  it("accepts an { id } object as the JSON og_image", () => {
    const resolved = resolveSeo(
      { seo: { og_image: { id: "object-og-uuid" } } },
      {},
    );
    expect(resolved.ogImageFileId).toBe("object-og-uuid");
    expect(resolved.source).toBe("json");
  });

  it("resolves the sitemap block with normalized priority", () => {
    expect(
      resolveSeo(
        { seo: { sitemap: { change_frequency: "monthly", priority: "0.5" } } },
        scalarFallback,
      ).sitemap,
    ).toEqual({ changeFrequency: "monthly", priority: "0.5" });

    expect(
      resolveSeo(
        { seo: { sitemap: { change_frequency: "weekly", priority: 0.8 } } },
        {},
      ).sitemap,
    ).toEqual({ changeFrequency: "weekly", priority: "0.8" });

    // sitemap has NO scalar counterpart — invalid shapes resolve to null.
    expect(resolveSeo({ seo: { sitemap: "weekly" } }, scalarFallback).sitemap).toBeNull();
    expect(resolveSeo({ seo: { sitemap: null } }, scalarFallback).sitemap).toBeNull();
  });
});
