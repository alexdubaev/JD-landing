// @directus-labs/seo-plugin 1.1.1 pilot verifier (API-automatable contract).
// Encodes the SEO JSON shape the plugin field stores, and the JSON-first /
// scalar-fallback resolver the frontend (Task 15) must implement. The plugin's
// UI rendering itself is browser-only QA (see pilot report).

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

// Top-level SEO keys the plugin JSON field is expected to manage. The exact
// sub-shape is confirmed during browser QA (Task 15); this is the contract the
// resolver is built against.
export const SEO_KEYS = ["title", "description", "canonical_url", "robots", "og"];

export function validateSeoJson(value) {
  const errors = [];
  if (!isObj(value)) return { ok: false, errors: ["seo json must be an object"] };
  if (value.title !== undefined && typeof value.title !== "string") errors.push("title must be string");
  if (value.description !== undefined && typeof value.description !== "string") errors.push("description must be string");
  if (value.canonical_url !== undefined && typeof value.canonical_url !== "string") errors.push("canonical_url must be string");
  if (value.robots !== undefined && !isObj(value.robots)) errors.push("robots must be an object");
  if (value.og !== undefined && !isObj(value.og)) errors.push("og must be an object");
  return { ok: errors.length === 0, errors };
}

// JSON-first / scalar-fallback: prefer the plugin JSON field when present and
// well-formed, otherwise fall back to the collection's scalar SEO fields.
// Scalar fields are NEVER deleted (architecture design / ADR-003).
export function resolveSeo({ json, scalar = {} } = {}) {
  const useJson = json && validateSeoJson(json).ok;
  const src = useJson ? json : scalar;
  return {
    source: useJson ? "json" : "scalar",
    title: src.title ?? scalar.title ?? null,
    description: src.description ?? scalar.description ?? null,
    canonical_url: src.canonical_url ?? scalar.canonical_url ?? null,
    robots: src.robots ?? scalar.robots ?? null,
    og: src.og ?? scalar.og ?? null,
  };
}
