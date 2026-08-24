# SEO Factory Core endpoint final fix report

Date: 2026-08-24

## Scope

Scoped integration fix limited to:

- `directus/extensions/directus-extension-seo-factory/src/index.js`
- `directus/extensions/directus-extension-seo-factory/dist/index.js`
- `directus/extensions/seo-factory-core-endpoint.test.mjs`
- this report

No schema, role, permission, dependency, deployment, frontend, catalogue, or secret changes were made.

## Changes

- Claim requests now require a non-empty `x-seo-worker-run` header of at most 128 characters. Body IDs and fallback worker IDs are not accepted.
- Claim selection includes expired `processing` work items. Recovery remains transactional and also locks/requires the matching expired `processing` shadow claim, so an active shadow lease is not stolen.
- Draft and release operations UUID-validate the work-item ID before database lookup, lock both lease rows, and require both `expires_at` and `lease_until` to remain valid during the transition.
- Recommendation conflict merges omit `status` and `worker_run_id`, preserving approved, processing, draft-created, and terminal lifecycle/ownership state while new inserts remain `ready`.
- All six recommendation JSON fields are validated before database access. Current/proposed/patch/metrics values use object shapes (with null allowed only for current/proposed/metrics); evidence/sources use arrays. Limits are depth 8, 100 entries per container, 1,000 nodes per field, 64 KiB serialized per field, and 128 KiB serialized across all six fields. Non-JSON values, cycles, non-finite numbers, and oversized keys are rejected with the generic client-validation error.
- Source and dist endpoint files remain byte-identical.

## TDD evidence

RED was observed against the unchanged endpoint for:

- lifecycle state and claim-owner fields being included in conflict merges;
- missing/oversized claim headers being accepted through body/default fallbacks;
- expired `processing` work items not being reclaimed;
- active shadow leases being stealable when only the work-item lease was expired;
- expired draft/release leases being accepted;
- malformed draft/release IDs reaching claim lookup as conflicts instead of client errors;
- wrong JSON top-level shapes, excessive depth/container size/node count, and byte-overflow payloads reaching the database.

GREEN was observed after the implementation with the focused endpoint suite.

## Verification

- `node --test directus/extensions/seo-factory-core-endpoint.test.mjs directus/extensions/seo-factory.test.mjs`
- `node --check directus/extensions/directus-extension-seo-factory/src/index.js`
- `node --check directus/extensions/directus-extension-seo-factory/dist/index.js`
- SHA-256 equality check for source/dist
- `git diff --check`
- allowed-file `git diff --name-only` gate

## Commit

This report is included in the single scoped commit `fix(seo-factory): harden leases and queue validation`; use `git rev-parse HEAD` for its immutable hash.

## Remaining concerns

- The focused tests use deterministic Knex-compatible fakes. They cover query and transaction behavior but do not replace a live PostgreSQL concurrency test under real lock contention.
- The JSON limits are endpoint safety limits, not database schema constraints. Any future trusted writer that bypasses this endpoint must enforce equivalent bounds.
