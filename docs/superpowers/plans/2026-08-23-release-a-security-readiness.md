# Release A Security Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Harden the current production topology without regressing item-aware revalidation, rejecting valid leads, or enabling unconfigured Basic Auth/Turnstile/restic paths.

**Architecture:** Keep the current Next.js App Router routes and Directus webhook contract. Add small server-side request/security helpers, reuse one bounded Turnstile verifier from leads and orders, and make deploy preflight fail before container changes when an explicitly enabled optional control lacks configuration. Caddy remains the only trusted proxy and overwrites the forwarded client address before the frontend.

**Tech Stack:** Next.js 16, TypeScript, Vitest, Node 20, POSIX shell, Caddy 2, Docker Compose, Directus 12.1.1.

**Spec:** `docs/superpowers/specs/2026-08-23-release-a-security-readiness-design.md`

## Global Constraints

- Work only in `D:\codex\JD_landing\.worktrees\release-a-security-readiness`, based on `agent/production-infrastructure`.
- Allowed source surface is limited to `deploy/**` security/deploy files, `frontend/next.config.ts`, `frontend/src/proxy.ts`, the leads/orders/revalidate API routes and tests, `frontend/src/lib/security/**`, Directus frontend-token helper/tests, and Release A documentation.
- Preserve current collection tags and item-aware `id`, `oldSlug`, and `newSlug` behavior in `frontend/src/app/api/revalidate/route.ts`.
- Do not modify products, categories, articles, storefront UI, Directus content/schema/roles, dependencies, Docker image versions, secrets, or user changes in the main checkout.
- Missing Turnstile configuration keeps the existing explicit opted-out behavior; configured Turnstile failures and timeouts fail closed.
- `ENABLE_DIRECTUS_CMS_BASIC_AUTH` and `ENABLE_RESTIC_BACKUP` default to false; an enabled control must fail preflight without its required settings before build/recreate.
- Do not print tokens, passwords, hashes, request bodies, or Turnstile responses.

## File Map

- `frontend/src/lib/security/request.ts`: bounded request-body reader and canonical forwarded-IP parser.
- `frontend/src/lib/security/request.test.ts`: chunked-body and ambiguous-forwarded-header contract tests.
- `frontend/src/lib/security/rate-limit.ts` and `.test.ts`: best-effort in-memory policy with a caller-supplied trusted key.
- `frontend/src/lib/security/turnstile.ts` and `.test.ts`: optional-mode verifier with abort timeout and failure handling.
- `frontend/src/proxy.ts` and `frontend/src/proxy.test.ts`: endpoint rate-limit policy; no raw client header trust.
- `frontend/src/app/api/leads/route.ts` and `.test.ts`: bounded JSON/multipart parsing and shared verifier integration.
- `frontend/src/app/api/orders/route.ts` and tests: bounded JSON parsing and shared verifier integration.
- `frontend/src/app/api/revalidate/route.ts` and `.test.ts`: regression-only changes; item-aware behavior must remain intact.
- `deploy/Caddyfile` and `deploy/caddyfile.test.mjs`: trusted forwarded-header overwrite and existing preview/security behavior.
- `deploy/compose.production.yml`, `deploy/deploy.sh`, `deploy/deploy.test.mjs`, `deploy/.env.production.example`: optional Caddy bindings and preflight flags/checks before any compose mutation.
- `deploy/backup.sh` and `deploy/backup.test.mjs`: retain working local backup and gate optional restic mode.
- `docs/runbooks/security-release-a.md`: operator preflight, verification, and owner-approval runbook.

## Implementation Tasks

### Task 1: Capture failing security contracts

**Files:**
- Create: `frontend/src/lib/security/request.test.ts`
- Create: `frontend/src/lib/security/turnstile.test.ts`
- Modify: `frontend/src/app/api/leads/route.test.ts`
- Modify: `frontend/src/app/api/orders/route.test.ts` (create if absent)
- Modify: `deploy/deploy.test.mjs`, `deploy/backup.test.mjs` (create backup test if absent)

**Interfaces:** Tests define the required behavior for later helpers: `readBodyWithinLimit(request, maxBytes)`, `getTrustedClientIp(headers)`, and `verifyTurnstile({ token, remoteIp, secret, timeoutMs })`.

- [ ] **Step 1: Add request helper tests.** Assert a stream with no `Content-Length` that sends more than five bytes rejects with `RequestTooLargeError`; assert one valid IP is accepted and a comma-separated chain, invalid value, and absent value return `null`.
- [ ] **Step 2: Add Turnstile tests.** Assert missing secret is allowed outside production, missing secret is allowed by the route contract in the current opted-out mode, a configured request with no visitor token returns false without fetch, a fetch timeout returns false, and a non-2xx provider response returns false.
- [ ] **Step 3: Add endpoint regression tests.** Send chunked JSON over a `ReadableStream` to leads/orders and assert `413` after the actual byte budget; send chunked multipart below the limit and assert it still reaches validation/storage; assert configured Turnstile receives only the canonical IP.
- [ ] **Step 4: Add deploy/backup static tests.** Assert deploy invokes preflight before `docker compose build`/`up`, checks the two CMS auth variables only when `ENABLE_DIRECTUS_CMS_BASIC_AUTH=true`, and checks restic settings only when `ENABLE_RESTIC_BACKUP=true`; assert backup retains `pg_dump`, upload archive, and local retention and has no unconditional restic invocation.
- [ ] **Step 5: Run the focused tests and verify failure.**

Run: `cd frontend; npx vitest run src/lib/security/request.test.ts src/lib/security/turnstile.test.ts src/app/api/leads/route.test.ts src/app/api/orders/route.test.ts`; then `cd ..\deploy; node --test deploy.test.mjs backup.test.mjs`.

Expected: FAIL because the helpers and integrations do not yet exist and the current handlers only trust `Content-Length`.

### Task 2: Implement bounded request and Turnstile helpers

**Files:**
- Create: `frontend/src/lib/security/request.ts`
- Create: `frontend/src/lib/security/turnstile.ts`
- Create: `frontend/src/lib/security/rate-limit.ts`
- Modify: the three tests from Task 1 as needed for exact types only.

**Interfaces:**
- Produces `RequestTooLargeError`.
- Produces `readBodyWithinLimit(request: Request, maxBytes: number): Promise<Uint8Array>`; it checks a finite `Content-Length` early, then reads every stream chunk and throws after the limit.
- Produces `getTrustedClientIp(headers: Headers): string | null`; it accepts exactly one syntactically valid address and rejects chains/ambiguous values.
- Produces `verifyTurnstile(options): Promise<boolean>`; it accepts `{ token, remoteIp, secret?, timeoutMs? }`, uses `AbortSignal.timeout(timeoutMs ?? 5000)`, and returns false on timeout, fetch failure, non-2xx, malformed JSON, or `{ success: false }`.
- Produces `checkRateLimit(key, { limit, windowMs })` and `resetRateLimits()` for deterministic proxy tests.

- [ ] **Step 1: Implement `readBodyWithinLimit` with a byte counter and reader cleanup.** Do not rely on `Content-Length`; concatenate only chunks that remain within the budget.
- [ ] **Step 2: Implement strict forwarded-IP parsing.** Use the server-compatible IP validator and reject comma-separated or malformed values rather than selecting the first client-supplied hop.
- [ ] **Step 3: Implement bounded Turnstile fetch.** Pass the abort signal, never log the secret/token, and keep missing-secret behavior as the explicit opted-out path until the owner enables the feature.
- [ ] **Step 4: Implement the small in-memory limiter.** Count per key/window and return `{ allowed, retryAfterSeconds }`; expose reset only for tests.
- [ ] **Step 5: Run helper tests.**

Run: `cd frontend; npx vitest run src/lib/security/request.test.ts src/lib/security/turnstile.test.ts src/lib/security/rate-limit.test.ts`.

Expected: PASS.

### Task 3: Integrate leads and orders without changing business behavior

**Files:**
- Modify: `frontend/src/app/api/leads/route.ts`
- Modify: `frontend/src/app/api/orders/route.ts`
- Modify: `frontend/src/app/api/leads/route.test.ts`
- Create/modify: `frontend/src/app/api/orders/route.test.ts`

**Interfaces:** Consume the Task 2 helpers. The route must preserve existing 201/400/503 payloads, attachment cleanup, Directus calls, and order compensation.

- [ ] **Step 1: Read the body once through `readBodyWithinLimit`.** Rebuild a request with the bounded bytes and original `content-type` before calling `json()` or `formData()`; allow chunked multipart below the configured limit.
- [ ] **Step 2: Replace duplicated `isHuman` code with `verifyTurnstile`.** Pass `getTrustedClientIp(request.headers)` and do not pass the raw forwarded header.
- [ ] **Step 3: Map `RequestTooLargeError` to `413`.** Keep malformed JSON and schema failures at `400`, storage/provider failures at `503`, and ensure uploaded files are still cleaned up on downstream failure.
- [ ] **Step 4: Run route tests.**

Run: `cd frontend; npx vitest run src/app/api/leads/route.test.ts src/app/api/orders/route.test.ts`.

Expected: PASS, including chunked-body, configured timeout, and missing-secret opted-out cases.

### Task 4: Harden proxy rate limiting and trusted Caddy forwarding

**Files:**
- Modify: `frontend/src/proxy.ts`
- Modify: `frontend/src/proxy.test.ts`
- Modify: `deploy/Caddyfile`
- Modify: `deploy/caddyfile.test.mjs`

**Interfaces:** `proxy` consumes `checkRateLimit` and uses only the canonical header produced by Caddy; ambiguous/missing values map to a shared `unknown` key and never choose the first hop.

- [ ] **Step 1: Add failing proxy tests.** Assert POST policies for leads/orders/revalidate, `429` with `Retry-After`, and that `X-Forwarded-For: attacker, trusted` cannot create a distinct attacker key; reset limiter state between tests.
- [ ] **Step 2: Implement the policy table.** Keep limits 5/hour leads, 10/hour orders, 30/minute revalidate; derive the key from the strict parser or `unknown`.
- [ ] **Step 3: Update Caddy reverse proxies.** Explicitly remove incoming `X-Forwarded-For` and set it from `{remote_host}` for frontend and Directus upstreams; preserve existing preview framing and security headers.
- [ ] **Step 4: Run proxy and Caddy tests.**

Run: `cd frontend; npx vitest run src/proxy.test.ts`; then `cd ..\deploy; node --test caddyfile.test.mjs`.

Expected: PASS. If a local Caddy binary exists, also run `caddy validate --config deploy/Caddyfile`.

### Task 5: Add deploy preflight and preserve the local backup path

**Files:**
- Modify: `deploy/deploy.sh`
- Modify: `deploy/deploy.test.mjs`
- Modify: `deploy/backup.sh`
- Create: `deploy/backup.test.mjs`
- Create: `deploy/.env.production.example`

**Interfaces:** Preflight runs before any build/recreate and reads settings without printing values.

- [ ] **Step 1: Implement `preflight`.** When `ENABLE_DIRECTUS_CMS_BASIC_AUTH=true`, require non-empty `DIRECTUS_CMS_AUTH_USER` and `DIRECTUS_CMS_AUTH_HASH`; when `ENABLE_RESTIC_BACKUP=true`, require `RESTIC_REPOSITORY`, `RESTIC_PASSWORD_FILE`, and an executable `restic`; otherwise leave both controls disabled and continue.
- [ ] **Step 1a: Bind optional CMS auth values only into the Caddy service.** Add empty-by-default `DIRECTUS_CMS_AUTH_USER` and `DIRECTUS_CMS_AUTH_HASH` Compose environment entries so a separately reviewed Caddy `basic_auth` block can consume the preflight-checked values without exposing them to frontend or Directus containers.
- [ ] **Step 2: Keep Caddy Basic Auth opt-in.** Do not add an unconditional `basic_auth` block while production variables are absent; document the exact enablement sequence and preflight failure in the env example/runbook.
- [ ] **Step 3: Keep `backup.sh` local-first.** Retain `pg_dump`, uploads archive, 700 backup directory, and 14-day local retention. If restic mode is added, make it conditional on the same flag and fail before creating a partial remote backup when required settings are absent.
- [ ] **Step 4: Add shell-static tests.** Verify function ordering (`preflight` before build), no secret echo, flag defaults, and local backup commands.
- [ ] **Step 5: Run deployment tests.**

Run: `cd deploy; node --test caddyfile.test.mjs deploy.test.mjs backup.test.mjs`.

Expected: PASS.

### Task 6: Preserve revalidation and complete operator documentation

**Files:**
- Modify: `frontend/src/app/api/revalidate/route.ts` only if required by shared body/validation changes.
- Modify: `frontend/src/app/api/revalidate/route.test.ts` only for missing regression coverage.
- Create: `docs/runbooks/security-release-a.md`

**Interfaces:** The revalidation response and side effects remain exactly compatible with current collection-only and item-aware webhook callers.

- [ ] **Step 1: Run the existing item-aware tests before touching the route.** Confirm legacy tags, old/new slug paths, product id lookup, delete fallback, and homepage singleton cases pass.
- [ ] **Step 2: Add only a regression if a current contract is uncovered.** Assert the resolved current item path plus `oldSlug`/`newSlug` semantics and no catalog route regressions; do not port the stale branch route.
- [ ] **Step 3: Write the runbook.** Include scope, preflight commands, secret-safe configuration checks, local verification routes, Caddy validation, backup restore prerequisites, and explicit owner approval gates for enabling Basic Auth, Turnstile, restic, or production deploy.
- [ ] **Step 4: Run the complete local gate.**

Run:

```powershell
cd frontend
npm run typecheck
npm run lint
npm test
npm run build
npm audit --omit=dev --audit-level=high

cd ..\deploy
node --test caddyfile.test.mjs deploy.test.mjs backup.test.mjs

cd ..\directus
node --test access/blueprint.test.mjs schema/blueprint.test.mjs schema/platform-compatibility.test.mjs
```

Expected: all commands pass; an existing high-severity `npm audit` finding is recorded separately if it is not introduced by this release.

### Task 7: Review, scope gate, and handoff

**Files:** No new source files; inspect all changed files.

- [ ] **Step 1: Run `git diff --check` and `git diff --name-only`.** Stop if any path is outside the Global Constraints allowlist.
- [ ] **Step 2: Run the security and code-quality review against the single release diff.** Check no secrets/logging, no raw forwarded-header trust, bounded body handling, no Turnstile fail-open after configuration, and no revalidation regression.
- [ ] **Step 3: Commit one reviewable Release A commit.** Use `git add` with the explicit allowlist and `git commit -m "security: harden production request and deploy paths"`.
- [ ] **Step 4: Report the commit, tests, unresolved audit findings, and the production prerequisites.** Do not deploy or enable production controls without owner approval.
