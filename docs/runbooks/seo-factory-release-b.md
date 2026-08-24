# Release B — SEO Factory shadow runbook

Release B ships a disabled, draft-only shadow foundation. It does not modify
published products, categories, pages, or articles and has no publish/apply
path.

Release B1 adds a Directus 12 Core-safe endpoint boundary. Use the executable
gate in [the B1 Core checklist](./seo-factory-release-b1-core-checklist.md).
Directus Core custom permission rules are not part of the worker design.

## Controls

Keep these values in `/opt/jd-landing/.env` until staging and owner approval are
complete:

```text
SEO_FACTORY_ENABLED=false
SEO_FACTORY_PRODUCTION_SCHEDULE=false
SEO_FACTORY_ALLOW_APPLY=false
SEO_FACTORY_ALLOW_PUBLISH=false
SEO_FACTORY_WORKER_ROLE_ID=
SEO_WORKER_TOKEN=
```

The compose service is profile-gated (`seo-factory`) and is not started by the
normal production compose command. Missing flags/token therefore leave no
running worker and no writes.

## Staging migration gate

1. Record the exact staging target and create the normal PostgreSQL/Directus
   backup. Stop if the backup cannot be restored or if the target is production.
2. Apply the reviewed Directus schema blueprint. In the same staging window,
   apply `directus/migrations/sql/seo-work-items-constraints-up.sql`, then
   `directus/migrations/sql/seo-factory-shadow-up.sql` with a unique
   `--set=release_id=<reviewed-id>` value. Verify the migration journal, unique
   dedupe constraint, and `seo_factory_claims` table before continuing.
3. Create only the `SEO Worker` role, empty policy, and role-policy access link
   through narrow authenticated Directus API operations. The policy must have
   `app_access=false`, `admin_access=false`, and **no direct collection permissions**.
   Do not run the full all-role `apply-access` operation for the
   B1 Core gate: unrelated historical policies can contain Core-incompatible
   custom rules.
4. Install the packaged `seo-factory` endpoint in the staging Directus
   extensions volume. Configure `SEO_FACTORY_WORKER_ROLE_ID` with the empty
   worker role ID, restart only staging Directus, and confirm the endpoint is
   loaded before issuing a worker request.
5. Provision the worker user/static token with
   `seo-worker/scripts/create-token.mjs` or an equivalently narrow API
   operation. Write the token to a root-owned `0600` file; never print, copy to
   a shell history, or commit the token. A token file with any other owner or
   mode is a STOP condition.

## Shadow verification

Capture counts and full-row hashes for every published source row before the
batch. Enable the profile only on staging, with `SEO_FACTORY_ENABLED=true` and
`SEO_FACTORY_PRODUCTION_SCHEDULE=true`, or invoke the same endpoint calls once
without starting the daemon. Run one bounded endpoint-only batch (start with
`limit=1`) and verify:

- `/seo-factory/inputs` returns only published products/categories/pages and
  only the allowlisted source fields;
- `/seo-factory/work-items/upsert` persists one UUID-backed `ready` row;
- a human/staging administrator, never the worker token, moves the reviewed row
  to `approved`;
- `/seo-factory/claim` moves only that bounded row to `processing`;
- `/seo-factory/draft` creates an escaped article with `status=draft` and moves
  the queue/lease to `draft_created` atomically;
- a second bounded claim followed by `/seo-factory/release` becomes
  `retryable` under the same `x-seo-worker-run` owner;
- recommendations are deterministic and deduped by `dedupe_key`;
- worker-token GET requests to `/items/products`, `/items/categories`,
  `/items/pages`, `/items/articles`, and `/items/seo_work_items` are denied;
- a worker-token POST to `/items/seo_work_items` is denied;
- the worker policy still has zero permission rows and no App/Admin access;
- before/after counts and full-row hashes match for published products,
  categories, pages, and articles. Published rows must be byte-for-byte
  unchanged.

Any unexpected direct collection access, published-row hash change, non-draft
article, unowned release, or unbounded request is a STOP. Do not compensate with
a broader policy or a staging-only database default.

## B1 production prohibition

There is **no production enable in B1**. Keep every SEO Factory flag false and
do not start the worker profile. Do not apply the worker role, policy, token,
claim migration, endpoint-only batch, or staging fixtures to production in this
release. B1 documentation and staging evidence do not authorize production
state changes. Any future production enable requires a separate scope, reviewed
commit, backup, explicit owner approval, and its own release verification.
