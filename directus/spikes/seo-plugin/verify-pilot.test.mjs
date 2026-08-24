import test from "node:test";
import assert from "node:assert/strict";

import { validateSeoJson, resolveSeo, SEO_KEYS } from "./verify-pilot.mjs";

const validJson = {
  title: "Каталог John Deere",
  description: "Подбор техники и комплектующих.",
  canonical_url: "https://deere-shop.ru/catalog",
  robots: { noindex: false, nofollow: false },
  og: { title: "Каталог", image: "abc-uuid" },
};

test("validateSeoJson accepts a well-formed SEO object", () => {
  const r = validateSeoJson(validJson);
  assert.equal(r.ok, true, r.errors.join("; "));
});

test("validateSeoJson rejects non-object and malformed types", () => {
  assert.equal(validateSeoJson(null).ok, false);
  assert.equal(validateSeoJson("nope").ok, false);
  assert.equal(validateSeoJson({ robots: "should-be-object" }).ok, false);
  assert.equal(validateSeoJson({ title: 123 }).ok, false);
});

test("resolveSeo uses plugin JSON when present and valid", () => {
  const out = resolveSeo({ json: validJson, scalar: { title: "scalar-title" } });
  assert.equal(out.source, "json");
  assert.equal(out.title, "Каталог John Deere");
  assert.equal(out.canonical_url, "https://deere-shop.ru/catalog");
});

test("resolveSeo falls back to scalar when JSON is absent", () => {
  const out = resolveSeo({ scalar: { title: "scalar-title", description: "scalar-desc" } });
  assert.equal(out.source, "scalar");
  assert.equal(out.title, "scalar-title");
  assert.equal(out.description, "scalar-desc");
});

test("resolveSeo falls back to scalar when JSON is corrupt (scalar never lost)", () => {
  const out = resolveSeo({ json: { robots: "broken" }, scalar: { title: "scalar-title" } });
  assert.equal(out.source, "scalar");
  assert.equal(out.title, "scalar-title");
});

test("SEO_KEYS lists the managed top-level fields", () => {
  assert.deepEqual(SEO_KEYS, ["title", "description", "canonical_url", "robots", "og"]);
});
