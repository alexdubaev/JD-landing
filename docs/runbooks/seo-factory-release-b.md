# Release B — SEO Factory shadow runbook

Release B ships a disabled, draft-only shadow foundation. It does not modify
published products, categories, pages, or articles and has no publish/apply
path.

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

1. Create the normal PostgreSQL/Directus backup.
2. Apply the Directus schema blueprint and `directus/migrations/sql/seo-factory-shadow-up.sql`
   with a unique `--set=release_id=<reviewed-id>` value. The migration creates a
   journal and lease table with `IF NOT EXISTS`; it never drops or deletes data.
3. Apply access blueprint and create the `SEO Worker` role/policy. It can read
   published `products`, `categories`, `pages`, `articles`, and `seo_work_items`,
   create/update `seo_work_items`, and create/update articles only with
   `status=draft`. It has no leads/orders/files/users/delete permissions.
4. Run `seo-worker/scripts/create-token.mjs` with an admin token and role ID.
   The generated static token is written to a root-owned `0600` file; the token
   itself is never printed or committed.
5. Install the built `seo-factory` endpoint into the Directus extensions volume,
   restart Directus, and verify `/seo-factory/claim` rejects requests without
   the configured worker role.

## Shadow verification

Enable the profile only on staging, with `SEO_FACTORY_ENABLED=true` and
`SEO_FACTORY_PRODUCTION_SCHEDULE=true`. Run one bounded batch and verify:

- only published inputs were read;
- recommendations are deterministic and deduped by `dedupe_key`;
- catalog and published article rows are byte-for-byte unchanged;
- two simultaneous claim calls produce one `processing` claim;
- a failed draft write returns the item to `retryable`;
- a successful draft is `status=draft`, then the queue item becomes
  `draft_created`.

## Production rollout

Deploy with every SEO Factory flag false and without the worker profile. The
normal frontend/CMS health checks remain the release gate. Enabling a shadow run
in production requires a separate owner approval after the staging evidence is
reviewed.
