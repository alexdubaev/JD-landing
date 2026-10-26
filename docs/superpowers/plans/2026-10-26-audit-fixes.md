# Audit fixes implementation plan

Goal: fix independently actionable findings from the owner's audit and preserve existing commercial data.
Architecture: scoped fixes in the existing Next.js frontend; no schema or dependency changes.
Spec: the audit and owner's instruction to implement everything not requiring their presence.

## Global constraints and scope

Scoped integration mode under ADR-002. The owner authorized fixing the audited lead/order processing, analytics and SEO issues. Production CMS, catalogue records, credentials, permissions, schema, deployment scripts, infrastructure and external analytics configuration remain read-only. No deployment or shared-branch merge. Keep existing stack and Russian copy. Never invent prices, compatibility, contact details or service promises. Working tree: /workspace/JD-landing-fixes, branch fix/audit-conversion-seo.

Allowed files: this plan; frontend/src/app/loading.tsx, frontend/src/app/catalog/loading.tsx, frontend/src/app/catalog/[categorySlug]/loading.tsx, frontend/src/app/catalog/[categorySlug]/[productSlug]/loading.tsx, frontend/src/app/articles/loading.tsx (remove premature route loading boundaries); frontend/next.config.ts (metadata streaming only; headers untouched); frontend/src/components/forms/LeadForm.tsx and tests; frontend/src/components/cart/CheckoutForm.tsx and its tests; frontend/src/lib/directus/orders.ts and tests; frontend/src/app/api/orders/route.ts and tests; frontend/src/lib/orders/schema.ts and tests; frontend/src/lib/leads/parts-request.ts and tests; frontend/src/components/forms/BulkPartsRequest.tsx and tests; frontend/src/components/catalog/ProductDetail.tsx and tests; frontend/src/lib/analytics.ts and tests; frontend/src/components/layout/Analytics.tsx and tests; frontend/src/lib/seo/site-title.ts and tests; frontend/src/app/layout.tsx and tests; frontend/src/app/robots.ts and tests; frontend/src/app/sitemap.ts and tests; frontend/src/lib/directus/client.ts and tests; frontend/src/app/error.tsx and tests; frontend/src/components/catalog/EmptyCatalog.tsx and tests; frontend/src/components/catalog/ProductGrid.tsx and tests; frontend/src/app/catalog/page.tsx and tests; frontend/src/app/catalog/[categorySlug]/page.tsx and tests; frontend/src/app/catalog/[categorySlug]/[productSlug]/page.tsx and tests; frontend/src/app/catalog/[categorySlug]/layout.tsx and tests; frontend/src/app/articles/layout.tsx and tests; frontend/src/app/articles/page.tsx and tests; frontend/src/app/articles/[slug]/page.tsx and tests; frontend/src/app/[infoSlug]/page.tsx and tests; frontend/src/app/parts-request/page.tsx and tests; frontend/src/app/cart/page.tsx and tests; frontend/src/lib/seo/trust-pages.ts and tests; frontend/src/components/sections/HomeCompanyTrust.tsx and tests.

## Tasks

- [x] 1. Checkout and list integrity: regression tests first. Send Turnstile token; parse single-space/tab quantities, retain hyphenated SKUs, reject invalid/zero/negative quantities and report line numbers; show parsed preview and never submit a partial list even with attachment. Use local product consultation anchor to retain context. Validate expected and existing form behavior.
- [x] 2. Server order snapshots: derive product identity/title/SKU/fixed RUB price from fresh published CMS records, reject missing/unavailable-for-cart records before any write, ignore client snapshot prices. Add meaningful tests for tampering, stale data, duplicate items and CMS failures. Do not implement payment or stock reservations.
- [x] 3. Analytics: consent-aware direct Metrica goal dispatch with valid counter registration; preserve dataLayer events and avoid losing early consented events; test Metrica-only/GTM-only/both/no-consent and repeated initialization.
- [x] 4. SEO: remove contradictory robots blocks for noindex service routes; stop title brand duplication without losing unique SEO titles; fail sitemap generation on CMS errors so a truncated successful map cannot replace complete cache; investigate streamed 404 and add pre-stream existence gates only if locally verifiable. Avoid altering pagination canonical semantics.
- [x] 5. Resilience/conversion: bounded CMS reads, no blind mutation retries; empty-search direct request action carrying query; contact fallback on error; remove exposed implementation-only company copy without changing CMS. Keep public contact data unchanged pending owner confirmation.
- [x] 6. Verification and review: targeted red/green tests, full frontend suite, lint, typecheck, production build; local HTTP checks with fixture CMS for route status and metadata. Independent Luna review. Verify allowed diff, commit reviewed result on task branch.

## Review focus

Malformed imported lines must not silently become other SKUs; captcha errors preserve cart; authoritative order reads fail before writes; consent remains respected; CMS failure is never mistaken for missing products or a complete sitemap.

## Deferred requiring data/access or measured evidence

Contact-email reconciliation, business promise/return/warranty copy, real catalogue enrichment, Yandex Webmaster/Metrica cabinet setup and manager-delivery verification, database search-index changes and infrastructure tuning. Existing client search scan is a measured-optimization candidate, not grounds for changing schema without data.

## Progress

- Baseline fdb294e; original main clean. Audit findings re-read before implementation.

- Ruling: empty search uses an inline LeadForm with the original query prefilled (LeadForm.tsx/test added to declared files before edits); no extra navigation or browser storage dependency.
- Baseline 531 passed/1 brand asset failed: investigating LFS pointer rather than changing test expectations.

- Ruling: missing-route metadata now calls notFound; local YandexBot still got 200 because streaming starts first. Disable metadata streaming (htmlLimitedBots) and verify HTTP status locally; this touches only the streaming flag in next.config.ts, added to scope before edit.

- Experiment: blocking metadata alone did not fix 200 in local dev. Reverted config flag; remove route-level loading boundaries that flush before notFound (all five declared before removal). Existing page-level controls Suspense and client transitions remain. Verify actual status before accepting.

## Final verification and handoff

- 2026-10-26: 105 test files, 571 tests passed (`npm run test:ci -- --maxWorkers=2`).
- `npm run lint`, `npm run typecheck`, `npm run build` passed; build intentionally had no CMS connection, matching deployment build constraints.
- Production build served locally with a fixture CMS: ordinary browser and YandexBot UAs each checked missing product, missing category, missing article and out-of-range article page (404), catalogue, contacts, robots and sitemap (200): 16/16 checks.
- Independent Luna review approved the complete code diff. Original main checkout untouched. No real lead/order submitted, no production CMS/deployment changes.
- Initial logo test failure was an unhydrated Git LFS pointer; restoring the tracked LFS asset resolved it without changing the asset/test.
- Earlier full run exposed dataLayer backwards-compatibility regressions during analytics integration; fixed before the final green full run.
- Removing five early route loading boundaries prevents status 200 being committed before notFound. Tradeoff: these routes wait for existence/data checks before showing route content instead of an early skeleton; read deadlines bound waiting.
- Read requests to CMS have a 10-second deadline. Mutations have no new automatic deadline/retry because ambiguous write completion needs idempotency/reconciliation first.
- Sitemap is generated at request time; a CMS error produces an error instead of replacing it with a successful incomplete map. No new durable last-known-good store is introduced.
- Numeric spaced SKU syntax remains supported (RE 50483); alphabetic-only SKU/quantity should use the documented dash separator or two Excel columns to avoid ambiguity. Parsed table lets customer inspect the result.
- Metrica goals now dispatch directly after consent/init. Existing GTM tags must be inspected before production enablement to avoid externally configured duplicate goals/counters.
- Deferred: authoritative contact email choice; factual catalogue enrichment; response SLA/warranty/returns terms; Yandex cabinet goals, indexing and regionality; manager notification delivery and live end-to-end form tests; database search optimization backed by measurements; shared rate-limiter/infrastructure changes.
- Browser visual/responsive verification unavailable in this session. No claim of visual QA or live deployment.
