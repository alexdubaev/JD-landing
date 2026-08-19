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
