# SEO QA and catalog semantics handoff

## Status

Implemented in the scoped code release. Do not create another SEO worker, a
second QA queue, or automatic product-content publishing.

## Implemented

- `seo-worker/src/qa-audit.mjs` reads products page by page and produces a
  read-only JSON report. It identifies duplicate or missing SEO titles,
  repeated `DEERE-SHOP` branding, import artefacts in descriptions, weak
  descriptions, missing media/alt text, missing product copy and missing
  related products.
- `node seo-worker/src/cli.mjs --dry-run --limit=N` performs the audit and
  returns JSON only. It never writes items or changes products. A Directus URL
  and worker token are required only for a real audit run.
- Category product cards render below the category H1 as H3 headings.
- The site emits one `WebSite` JSON-LD node with the `/catalog?q=` search
  action.
- `/llms.txt` exposes up to ten indexable categories, up to three articles and
  factual procurement caveats. It intentionally does not list the full product
  corpus.

## Editorial workflow

1. Run the worker in `--dry-run` mode with a read-only Directus credential.
2. Use the report to create or triage draft `seo_work_items`; do not apply
   changes automatically.
3. Editors update only confirmed Directus data, revalidate each changed route
   and mark the corresponding task as reviewed.

## Deferred, not missing implementation

- Content for the first ten categories and fifty products requires the
  owner-provided demand/sales export and source-backed product facts.
- The footer disclaimer and default OG image are existing Directus fields and
  need a separate content-only release.
- Public mobile LCP measured around three seconds. The hero already has
  `next/image` priority and responsive WebP delivery. Lighthouse attributes a
  remaining blocking cost to global CSS; `frontend/src/app/globals.css` had
  unrelated uncommitted changes, so no CSS refactor was bundled.

## Verification

- Frontend: 396 Vitest tests, TypeScript check and production build passed.
- SEO worker: 70 Node tests and `npm run check` passed on Windows.

## Guardrails for future agents

- Preserve draft-only, read-only QA behavior. Never add Directus writes or
  automatic publishing to the audit command.
- Keep JSON-LD server-rendered and emit one WebSite/SearchAction node.
- Do not edit schema, permissions, prices, product facts, lead processing or
  infrastructure as part of this feature.
