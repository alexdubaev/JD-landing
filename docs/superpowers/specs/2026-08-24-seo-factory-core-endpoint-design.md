# Release B.1 — SEO Factory Core endpoint design

## Goal

Keep the SEO Factory shadow workflow safe on self-hosted Directus 12 Core,
which does not allow custom permission filters or validation rules without a
license. A compromised worker token must not be able to read catalogue data,
create a published article, or write a collection directly.

## Confirmed constraint

The Release B disposable Directus 12.1.1 staging check returned
`RESOURCE_RESTRICTED` when creating a custom permission rule. Therefore the
previous worker role cannot safely rely on `status=published` read filters or
`status=draft` validation rules. Direct collection grants must be removed
rather than silently falling back to unrestricted access.

## Architecture

`SEO Worker` remains a non-Studio Directus role, but its policy has **no
collection permissions**. Its static token may authenticate to the custom
`seo-factory` endpoint only. Each route rejects any role other than the role
id supplied by `SEO_FACTORY_WORKER_ROLE_ID`.

The endpoint is the sole capability boundary and uses its server-side database
context for the following bounded operations:

1. `POST /inputs` returns at most 100 limited-field rows from only published
   `products`, `categories`, and `pages`.
2. `POST /work-items/upsert` validates a bounded recommendation, forces its
   state to `ready`, and idempotently creates or updates only
   `seo_work_items` by `dedupe_key`.
3. `POST /claim` retains the row-locked, lease-bounded
   `approved -> processing` claim.
4. `POST /draft` verifies the caller owns a `processing` claim, escapes title
   and sections, creates one `articles` row with `status=draft`, and updates
   that work item to `draft_created` in one database transaction.
5. `POST /release` verifies claim ownership and changes only the caller's
   failed `processing` item to `retryable`.

There is no endpoint to publish, promote, apply a patch to catalogue data,
read arbitrary collection rows, or access leads/orders/users/files. Endpoint
errors are generic; no token, SQL, or internal stack detail is returned.

## Worker contract

The worker uses only `/seo-factory/*` requests. It keeps deterministic
recommendation planning locally, but never calls `/items/products`,
`/items/categories`, `/items/pages`, `/items/seo_work_items`, or
`/items/articles`. It passes a generated bounded run id in a request header;
the endpoint records and checks that id for claim, draft, and retry ownership.

The worker remains disabled by default and profile-gated. `allowApply` and
`allowPublish` stay hard-coded false. Every fetch keeps `AbortSignal.timeout`,
and scheduler ticks remain non-overlapping.

## Scope lock

Requested behaviour: replace Directus-license-dependent worker permissions
with endpoint-only capabilities suitable for Directus 12 Core.

Allowed files:

- `seo-worker/**` and its focused tests;
- `directus/access/blueprint.mjs` and tests;
- `directus/extensions/directus-extension-seo-factory/**` and focused tests;
- `deploy/compose.production.yml`, `deploy/seo-factory.env.example`, release
  runbook and focused tests only if the endpoint-only configuration requires
  them;
- Release B.1 design/plan/runbook documentation.

Protected: storefront, catalogue and article content, database data,
leads/orders/users/files, unrelated roles, real secrets, dependencies, Caddy,
and production flags. The first Release B.1 production deployment remains
disabled and does not run migrations, seed data, or the worker.

## Verification

- tests first: a worker token has zero direct collection permissions;
- route tests prove an unauthorized token is rejected and each endpoint
  performs only its declared operation;
- tests prove published-only input, bounded fields, deterministic queue
  upsert, escaped draft HTML, claim ownership, atomic draft creation, and
  retry after a draft failure;
- worker tests prove no `/items/*` catalogue, queue, or article requests;
- disposable Directus 12 Core staging applies the empty worker policy without
  `RESOURCE_RESTRICTED` and verifies the endpoint workflow;
- worker, Directus focused, deploy, frontend gates, scope/secret scan;
- production deployment with all SEO Factory flags false and no `seo-factory`
  profile.

## Rollout

1. Build and test in an isolated branch and disposable Directus Core staging.
2. Merge one reviewed commit and deploy code with the worker disabled.
3. Back up persistent staging, install the endpoint, apply the empty worker
   role and token, then run one bounded shadow batch.
4. Compare catalogue/published article records before and after the batch.
5. Production shadow execution requires a separate owner approval after that
   staging evidence is reviewed.
