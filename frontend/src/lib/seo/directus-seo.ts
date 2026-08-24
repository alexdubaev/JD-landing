/**
 * Shared SEO resolver of the R11 dual-read (Task 15).
 *
 * The additive `seo` JSON field (vendored @directus-labs/seo-plugin 1.1.1)
 * wins per key; the legacy scalar SEO fields (seo_title, seo_description,
 * canonical_url, og_image, is_indexable) are the per-key fallback. While the
 * JSON is null — the production state until the CMS apply + migration — the
 * resolver reproduces the scalar mapping EXACTLY, so wiring it into the
 * Directus fetch layers is a zero-behavior-change refactoring for scalar-only
 * items.
 *
 * The resolver is pure and never throws: corrupted JSON (strings, arrays,
 * numbers, wrong-typed keys) degrades per key to the scalar fallback.
 */

/**
 * The plugin JSON contract (readme v1.1.1):
 * {
 *   "title": "string",
 *   "meta_description": "string",
 *   "og_image": "<directus file uuid>",
 *   "focus_keyphrase": "string",
 *   "additional_fields": { "canonical_url": "https://…" },
 *   "sitemap": { "change_frequency": "monthly", "priority": "0.5" },
 *   "no_index": false,
 *   "no_follow": false
 * }
 */
export type DirectusSeoJson = {
  title?: string | null;
  meta_description?: string | null;
  og_image?: string | null;
  focus_keyphrase?: string | null;
  additional_fields?: { canonical_url?: string | null } | null;
  sitemap?: {
    change_frequency?: string | null;
    priority?: string | number | null;
  } | null;
  no_index?: boolean | null;
  no_follow?: boolean | null;
};

export type ResolvedSeoSitemap = {
  changeFrequency: string | null;
  priority: string | null;
};

/**
 * Normalized SEO of one item. `ogImageFileId` stays the RAW Directus file
 * UUID — URL resolution keeps flowing through the existing asset helpers, so
 * the wiring layer changes nothing about image handling.
 */
export type ResolvedSeo = {
  title: string | null;
  description: string | null;
  canonical: string | null;
  ogImageFileId: string | null;
  noIndex: boolean;
  noFollow: boolean;
  sitemap: ResolvedSeoSitemap | null;
  /** Which side contributed at least one resolved key. */
  source: "json" | "scalar" | "default";
};

/** The legacy scalar values of one item (the per-key fallback). */
export type SeoFallback = {
  title?: string | null;
  description?: string | null;
  canonical?: string | null;
  ogImageFileId?: string | null;
  noIndex?: boolean | null;
  noFollow?: boolean | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

/** Accepts the raw UUID string (plugin contract) and an { id } relation object. */
const fileRef = (value: unknown): string | null => {
  const direct = nonEmptyString(value);
  if (direct !== null) return direct;
  if (isRecord(value)) return nonEmptyString(value.id);
  return null;
};

/**
 * Carries a raw `seo` value into the typed world: only a JSON object counts
 * (Directus cast-json returns objects); everything else — null, strings,
 * arrays, numbers — maps to null so items without usable JSON render exactly
 * as before.
 */
export function parseSeoJson(value: unknown): DirectusSeoJson | null {
  return isRecord(value) ? (value as DirectusSeoJson) : null;
}

const resolveSitemap = (value: unknown): ResolvedSeoSitemap | null => {
  if (!isRecord(value)) return null;
  const priority =
    typeof value.priority === "number" && Number.isFinite(value.priority)
      ? String(value.priority)
      : nonEmptyString(value.priority);
  return {
    changeFrequency: nonEmptyString(value.change_frequency),
    priority,
  };
};

/**
 * JSON-first / scalar-fallback resolution. Per key:
 * - the plugin JSON value wins when it is present AND correctly typed;
 * - otherwise the scalar fallback value passes through unchanged (so the
 *   pre-R11 mapping behavior is preserved bit-for-bit);
 * - `noIndex`/`noFollow` default to false when neither side provides them.
 */
export function resolveSeo(
  item: { seo?: unknown } | null | undefined,
  fallback: SeoFallback = {},
): ResolvedSeo {
  const json = parseSeoJson(item?.seo);
  let jsonUsed = false;
  let scalarUsed = false;

  const scalar = <T>(value: T | null | undefined): T | null => {
    if (value !== null && value !== undefined) scalarUsed = true;
    return value ?? null;
  };

  // JSON-first per key: a non-null jsonValue (already validated) wins and
  // flags the JSON side; null means "no usable JSON value" — fall back.
  const jsonOrScalar = <T>(jsonValue: T | null, fallbackValue: T | null | undefined): T | null =>
    jsonValue !== null ? ((jsonUsed = true), jsonValue) : scalar(fallbackValue);

  const title = jsonOrScalar(
    json ? nonEmptyString(json.title) : null,
    fallback.title,
  );
  const description = jsonOrScalar(
    json ? nonEmptyString(json.meta_description) : null,
    fallback.description,
  );
  const canonical = jsonOrScalar(
    json && isRecord(json.additional_fields)
      ? nonEmptyString(json.additional_fields.canonical_url)
      : null,
    fallback.canonical,
  );
  const ogImageFileId = jsonOrScalar(
    json ? fileRef(json.og_image) : null,
    fallback.ogImageFileId,
  );
  const noIndex = jsonOrScalar(
    json !== null && typeof json.no_index === "boolean" ? json.no_index : null,
    typeof fallback.noIndex === "boolean" ? fallback.noIndex : null,
  ) ?? false;
  const noFollow = jsonOrScalar(
    json !== null && typeof json.no_follow === "boolean" ? json.no_follow : null,
    typeof fallback.noFollow === "boolean" ? fallback.noFollow : null,
  ) ?? false;

  const sitemap = json ? resolveSitemap(json.sitemap) : null;
  if (sitemap !== null) jsonUsed = true;

  return {
    title,
    description,
    canonical,
    ogImageFileId,
    noIndex,
    noFollow,
    sitemap,
    source: jsonUsed ? "json" : scalarUsed ? "scalar" : "default",
  };
}
