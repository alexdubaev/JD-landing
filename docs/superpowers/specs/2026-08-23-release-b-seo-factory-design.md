# Release B — SEO Factory shadow foundation

## Requested behaviour

- The worker is disabled unless `SEO_FACTORY_ENABLED=true` and the production
  schedule is explicitly enabled.
- A shadow run reads only published `products`, `categories`, and `pages`,
  derives deterministic recommendations, and upserts `seo_work_items` by a
  stable dedupe key. It never mutates catalogue rows or published content.
- Approved content opportunities use an atomic `approved → processing →
  draft_created` claim. A lease makes failed work retryable and two workers
  cannot create two drafts for one item.
- Draft titles and body text are serialized as text/escaped HTML. No publish
  endpoint or `SEO_FACTORY_ALLOW_PUBLISH` path exists; apply remains disabled.
- Every Directus request has a timeout and scheduler ticks do not overlap.

## Allowed files

- `seo-worker/**`;
- `directus/access/blueprint.mjs` and tests;
- `directus/schema/blueprint.mjs`, snapshot, translations, migrations and tests;
- `directus/extensions/directus-extension-seo-factory/**`;
- `deploy/compose.production.yml`, `deploy/seo-factory.env.example`, deployment
  runbook and tests;
- new SEO Factory release documentation and focused tests.

## Protected areas

Storefront code, product/category/article content (especially `published` rows),
leads, orders, users/files, existing Directus policies, secrets, unrelated
deploy/security changes, and production data are out of scope.

## Verification routes and gates

- `seo-worker`: `npm test`, `npm run build`, `npm run dry-run`;
- `directus`: `npm test`, `npm run schema:check`;
- `frontend`: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`;
- static scope and secret scans before commit;
- production rollout keeps all SEO Factory flags false.
