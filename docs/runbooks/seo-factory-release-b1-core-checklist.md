# Release B1 — Directus Core endpoint checklist

Use this checklist for the SEO Factory staging gate on Directus 12 Core. It is
an executable STOP/go record, not authorization to enable production.

## Non-negotiable boundary

- [ ] Target is a named staging or fresh disposable Directus 12.1.1/PostgreSQL
      17 stack on an unused loopback port. Record exact container/network names.
- [ ] Production and existing unrelated local containers are excluded from
      every command target.
- [ ] The `SEO Worker` policy has `app_access=false`, `admin_access=false`, and
      **no direct collection permissions**.
- [ ] No Directus Core custom `permissions`, `validation`, or `presets` rule is
      used to simulate endpoint capability checks.
- [ ] The worker may reach SEO Factory data only through `/seo-factory/*`.
- [ ] All production flags stay false and the production worker profile stays
      stopped. There is no production enable in B1.

Stop immediately if any item above cannot be proved.

## 1. Freeze the target and back up

- [ ] Record Directus image/tag, PostgreSQL image/tag, loopback address, exact
      resource names, current commit, and extension package checksum.
- [ ] Record the names and IDs of protected existing containers before staging.
- [ ] Create a PostgreSQL custom-format backup before schema writes.
- [ ] Record backup byte size and SHA-256 without recording credentials or row
      contents.
- [ ] Verify the restore procedure for the target class. A missing or
      unverifiable backup is a STOP.

Use generated staging-only credentials. Keep them in process memory or a
protected secret file; never place them in commands, logs, evidence, or Git.

## 2. Apply schema and claim migrations

Apply in this order on the recorded staging database:

1. the reviewed Directus schema blueprint;
2. `directus/migrations/sql/seo-work-items-constraints-up.sql`;
3. `directus/migrations/sql/seo-factory-shadow-up.sql` with a unique,
   reviewed `release_id`.

- [ ] Schema apply completed without deleting or changing existing content.
- [ ] `seo_work_items.id` is a required UUID and the endpoint supplies it on a
      raw insert.
- [ ] `seo_work_items_dedupe_key_unique` exists.
- [ ] `seo_factory_claims` exists.
- [ ] `seo_factory_migrations` contains `seo-factory-shadow-001` with the
      staging release ID.
- [ ] Published baseline counts/hashes are captured after fixture setup and
      before the endpoint batch.

Do not add a database default or manual row to hide an endpoint failure. The
endpoint must pass against the declared schema.

## 3. Create endpoint-only identity

Use narrow authenticated Directus API operations for only these objects:

1. create/find the `SEO Worker` role;
2. create/find an `SEO Worker` policy with App/Admin access false;
3. attach that policy to that role;
4. create/find the staging-only worker user and static token.

Do **not** run the full all-role `directus/access/apply-access.mjs` operation for
this Core proof. Unrelated historical policies can contain custom rules that
are unavailable in Directus Core.

- [ ] Query `/permissions` for the worker policy: zero rows.
- [ ] Query the policy: `app_access=false`, `admin_access=false`.
- [ ] Write the generated token to a root-owned `0600` file.
- [ ] Record only token owner, mode, and byte length. Never record the value.

## 4. Install and bind the endpoint

- [ ] Install the packaged
      `directus/extensions/directus-extension-seo-factory` directory in the
      staging Directus extensions volume.
- [ ] Set `SEO_FACTORY_WORKER_ROLE_ID` to the endpoint-only role ID in staging.
- [ ] Restart only the named staging Directus service/container.
- [ ] Confirm Directus logs `Loaded extensions: seo-factory`.
- [ ] Confirm an authenticated admin login/readiness request succeeds.
- [ ] Confirm a missing token or wrong role is rejected by the endpoint.

The endpoint is the capability boundary. Do not grant collections to make an
endpoint request pass.

## 5. Seed and capture the baseline

On a disposable proof stack, seed one published and one draft fixture in each
of `products`, `categories`, `pages`, and `articles`. On persistent staging,
use reviewed staging fixtures and do not overwrite shared editorial rows.

- [ ] Capture published row counts and full-row hashes for all four collections.
- [ ] The hash input is deterministic and ordered by primary key.
- [ ] Evidence contains only collection, count, and hash—no row payloads.

## 6. Run one bounded endpoint-only batch

Start with `limit=1`. Use a bounded ASCII `x-seo-worker-run` value for every
mutation. The worker token must issue only these calls:

1. `POST /seo-factory/inputs` with `limit=1`;
2. `POST /seo-factory/work-items/upsert` for one recommendation;
3. after human/admin review changes that row to `approved`,
   `POST /seo-factory/claim` with `limit=1`;
4. `POST /seo-factory/draft` for the owned claim;
5. on a second reviewed item, bounded claim then
   `POST /seo-factory/release` under the same run owner.

- [ ] Inputs contain one published row per available source collection, exclude
      draft rows, and expose only `id`, `status`, `slug`, `title`, `seo_title`,
      and `seo_description`.
- [ ] Upsert returns `ready` and persists a server-generated UUID.
- [ ] Claim returns `processing` and creates one owned lease.
- [ ] Draft returns `draft_created`; the article is `status=draft`; HTML input
      is escaped; queue and lease completion are atomic.
- [ ] Release returns `retryable` for the same run owner.
- [ ] No batch call targets `/items/*`.

## 7. Prove collection denial and published immutability

With the worker token, require HTTP denial for:

- [ ] `GET /items/products`;
- [ ] `GET /items/categories`;
- [ ] `GET /items/pages`;
- [ ] `GET /items/articles`;
- [ ] `GET /items/seo_work_items`;
- [ ] `POST /items/seo_work_items`.

Then query the worker policy again and compare the baseline:

- [ ] Worker policy permission rows remain zero.
- [ ] App/Admin access remains false.
- [ ] Published product count/hash is unchanged.
- [ ] Published category count/hash is unchanged.
- [ ] Published page count/hash is unchanged.
- [ ] Published article count/hash is unchanged.
- [ ] Every article created by the endpoint is a draft.

Any allowed direct collection request, changed published hash, or published
endpoint-created article is a STOP and forbids rollout.

## 8. Evidence and exact cleanup

- [ ] Record versions, commit, migration IDs, counts, hashes, status
      transitions, denial status codes, empty-policy count, token owner/mode,
      and non-secret cleanup results.
- [ ] Remove the generated token first.
- [ ] Remove only the exact disposable containers and network created for the
      proof. Never use a broad name filter as a deletion target.
- [ ] Verify the disposable loopback port is free.
- [ ] Remove only the exact disposable backup/evidence directory after the
      required non-secret evidence is copied into the task report.
- [ ] Recheck protected existing container IDs/statuses after cleanup.

For persistent staging, follow its retention policy instead of deleting shared
resources. The exact-cleanup instructions apply only to a disposable proof
stack.

## 9. B1 release decision

- [ ] Focused runbook test passes.
- [ ] Git diff contains only the reviewed B1 documentation/test surface.
- [ ] No secret scanner finding is present.
- [ ] All SEO Factory production flags are false or absent.
- [ ] Production worker profile is not started.
- [ ] No worker role/token/migration/fixture is applied to production.

Result for B1: documentation and disposable Core compatibility evidence only.
Enabling production requires a separate owner-approved release; checking every
box here does not grant that authority.

## Verified disposable proof — 2026-08-24

The Task 5 proof used endpoint commit
`006d30b195b39dd98f59afc2e7b1429ac2412c9c` after live Core findings were
corrected in `685c729` (server UUID for queue inserts) and `006d30b`
(PostgreSQL-qualified claim attempt counter).

| Gate | Observed result |
| --- | --- |
| Platform | Directus 12.1.1; PostgreSQL 17; unused `127.0.0.1` port |
| Backup | PostgreSQL custom format; 96,988 bytes; SHA-256 recorded in the Task 5 report |
| Schema | 470 fresh-stack actions; unique dedupe constraint and `seo-factory-shadow-001` journal verified |
| Identity | App false; Admin false; zero permission rows; token file root/0600 |
| Inputs | `limit=1`; one published product/category/page; draft rows excluded; allowlisted fields only |
| Draft flow | upsert `ready` → claim `processing` → `draft_created`; UUID persisted; article draft; HTML escaped |
| Release flow | upsert `ready` → claim `processing` → `retryable` under the same run owner |
| Direct access | Five collection GETs and one queue POST each returned HTTP 403 |
| Published products | count 1; before/after hash `0c115a6efdf8c892519a7a2895f8359a` |
| Published categories | count 1; before/after hash `401542a60d6e21f9e20a349e630c697e` |
| Published pages | count 1; before/after hash `009f30e7501e0c96974e3c4189ad3842` |
| Published articles | count 1; before/after hash `09583632d0b1143a19bafc5ac950731d` |
| Cleanup | Exact token, two disposable containers, network, backup directory, and loopback binding removed |
| Protected containers | Recorded IDs remained unchanged and running before and after proof |

No credential or token value is part of this checklist or its Git history.
