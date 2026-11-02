# IndexNow: exact item URLs, 2026-11-02

## Scope and scenario

When an editor changes a product, category, article or page, notify IndexNow
of the exact known item URLs as well as the existing collection listing.
Bound external requests and record their outcomes without secrets or payloads.

Allowed files: this document, `frontend/src/lib/seo/indexnow.ts`,
`frontend/src/lib/seo/indexnow.test.ts`,
`frontend/src/app/api/revalidate/route.ts`, and its `route.test.ts`.
Authentication, secrets, CMS Flows/settings/data, dependencies, forms, leads,
Docker, Caddy and other public routes remain outside the change scope.

## Behaviour

- Existing item-ID lookups supply the current product/category/article/page URL.
- Product creation with the existing Flow's missing ID resolves a unique product
  by its new slug. Ambiguous matches use the listing fallback, never a guessed URL.
- Existing article/category/page oldSlug/newSlug payloads notify both URLs.
- Product callers may supply oldCategorySlug/newCategorySlug with their
  corresponding oldSlug/newSlug to identify historical or moved/deleted paths.
- Unknown deleted paths cannot be reconstructed after deletion. The deployed
  Flow has no pre-delete/pre-update snapshot; it still notifies the listing,
  flushes collection tags, and logs the unavailable-path fallback. This change
  does not claim complete bulk-event or historical-URL coverage by that Flow.
- Duplicate paths are removed. IndexNow receives normalized same-site paths
  without queries/fragments, at most 10,000 URLs per submission.
- CMS item lookup and IndexNow requests each have a five-second timeout.
  IndexNow errors do not fail an already successful cache flush. No retry loop.
- Server logs contain HTTP status/count/outcome, or a generic network/timeout
  reason; no keys, request bodies/headers, URL lists or raw transport errors.
- HTTP 200 means submitted; HTTP 202 means key verification pending. Neither
  proves crawl completion, indexing, rankings or conversions.

## Verification

- Affected helper/route tests: 34 passed. One fresh independent review: clean.
- TypeScript and ESLint: passed.
- Full frontend suite: 538 passed; one brand-asset test initially failed because
  the new checkout contained a Git LFS pointer. Restoring the tracked public
  assets with Git LFS and rerunning that failed test passed (539 total verified).
- Next.js production build: passed with unreachable CMS and placeholder build
  credentials, never with production secrets.
- Before any production replacement, verify the actual assembled release source
  and the five-file diff against the currently deployed source. Public checks:
  homepage, catalog, an existing product/category/article, robots and sitemap;
  valid IndexNow key file (without exporting its filename/content); bounded
  revalidation of one existing item and safe IndexNow acknowledgement log.

## Release baseline

At investigation time origin/main was fdb294e, while production ran 751a27f
from fix/audit-conversion-seo (PR 3 remains open; PR 4 merged into that branch).
Deploying a whole main-derived frontend would revert accepted forms/analytics.
The IndexNow fix must be integrated separately and any production candidate must
retain 751a27f as an ancestor, with exactly the allowed files changed relative
to that deployed baseline. Do not merge or rewrite unrelated PR 3 as a shortcut.
The final operational receipt belongs outside the repository and must distinguish
source integration, actual deployment, acceptance and indexing evidence.
