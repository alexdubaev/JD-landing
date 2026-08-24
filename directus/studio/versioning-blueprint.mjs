// Task 16 (R12): Directus content versioning is enabled per collection through
// the collection `meta.versioning` flag. Verified against the Directus 12.1.1
// source in the staging container: it is a core native feature, NOT gated by
// the license, and singleton collections (home_page) are explicitly supported
// by the versions service.
//
// This blueprint is declarative only: the applier patches exactly the
// `versioning` meta key for the collections listed here and never touches any
// other meta (translations, sort, group, display_template, …).

export const versioningBlueprint = {
  // Editorial collections that get draft versions + Live Preview:
  // articles (R12A pilot), pages and home_page (R12B after the pilot report).
  collections: {
    articles: { versioning: true },
    pages: { versioning: true },
    home_page: { versioning: true },
  },
};

/**
 * Adds Directus Live Preview URLs without baking a deployment host into the
 * source tree. Directus replaces {{id}} with the edited item's UUID and
 * {{$version}} with the selected native version key.
 */
export function buildVersioningBlueprint(previewBridgeUrl) {
  const base = new URL(previewBridgeUrl);
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const isLoopbackHttp = base.protocol === "http:" && loopbackHosts.has(base.hostname);
  if (base.protocol !== "https:" && !isLoopbackHttp) {
    throw new TypeError("Preview bridge URL must use HTTPS");
  }
  const prefix = base.toString().replace(/\/$/u, "");
  return {
    collections: Object.fromEntries(
      Object.entries(versioningBlueprint.collections).map(([name, config]) => [
        name,
        {
          ...config,
          previewUrl: `${prefix}/${name}/{{id}}?version={{$version}}`,
        },
      ]),
    ),
  };
}
