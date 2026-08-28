# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all C1–C10, H1–H15, M1–M14, and L1–L10 findings in `SECURITY-AUDIT.md` while preserving the public catalog, lead, order, Directus, and deployment workflows.

**Architecture:** Put all reusable validation and security decisions behind small server-only modules, then consume them from API routes, Directus adapters, layouts, and the Next proxy. Apply independent controls at the browser/Next, Caddy/Directus, and Docker/backup layers. Every new behavior starts with a focused regression test reproducing the audited bypass.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod 4, Vitest 3, Directus 12, PostgreSQL 17, Docker Compose, Caddy 2, shell scripts, Restic.

## Global Constraints

- Production secret, CAPTCHA, webhook, and deployment checks must fail closed; only explicit development fallbacks may be permissive.
- Never add real credentials, token values, repository URLs, password hashes, production IPs, or operational email addresses to source control.
- Preserve the existing untracked `.tmp/` and `SECURITY-AUDIT.md` files.
- Use `env_file` with root-only permissions for production secrets; Compose files must not inline secret values in `environment:`.
- Each new production function requires a failing test before implementation; run the focused test after the failing and passing states.
- Before release, run `npm audit`, all frontend tests, lint, TypeScript typecheck, production build, Directus script tests, and deploy/Caddy configuration tests.

---

## Planned File Structure

| Path | Responsibility |
| --- | --- |
| `frontend/src/lib/security/secrets.ts` | Constant-time secret comparison and production secret validation. |
| `frontend/src/lib/security/turnstile.ts` | Shared fail-closed Turnstile verification. |
| `frontend/src/lib/security/urls.ts` | Safe rendering of CMS-supplied internal, HTTPS, `mailto:`, and `tel:` links. |
| `frontend/src/lib/security/analytics.ts` | GTM/Metrica ID validation. |
| `frontend/src/lib/security/request.ts` | Trusted client IP parsing and byte-limited body readers. |
| `frontend/src/lib/security/rate-limit.ts` | Token-bucket limits with an in-memory development adapter and Redis-ready interface. |
| `frontend/src/proxy.ts` | Early API throttling. |
| `frontend/public/analytics-loader.js` | Static, CSP-compatible analytics bootstrapper without inline JavaScript. |
| `frontend/src/app/api/csp-report/route.ts` | Bounded, non-sensitive CSP violation logging endpoint. |
| `deploy/` | Compose, Caddy, deployment, backup, timer, and environment templates. |
| `directus/access/` and `directus/schema/` | Versioned least-privilege access policy and schema validation. |

## Task 1: Security primitives for secrets, URLs, analytics, and request bodies

**Files:**
- Create: `frontend/src/lib/security/secrets.ts`
- Create: `frontend/src/lib/security/urls.ts`
- Create: `frontend/src/lib/security/analytics.ts`
- Create: `frontend/src/lib/security/request.ts`
- Create: `frontend/src/lib/security/secrets.test.ts`
- Create: `frontend/src/lib/security/urls.test.ts`
- Create: `frontend/src/lib/security/analytics.test.ts`
- Create: `frontend/src/lib/security/request.test.ts`

**Interfaces:**
- Produces `safeEqual(received: string | null, expected: string): boolean`, `requireProductionSecret(name: string, value: string | undefined, minLength: number): string`.
- Produces `safeUrl(raw: string | null | undefined, fallback?: string): string | null` and `safeSameOriginPath(raw: string | null | undefined): string | null`.
- Produces `parseGtmId(value: string | null | undefined): string | null` and `parseMetricaId(value: string | null | undefined): string | null`.
- Produces `getTrustedClientIp(headers: Headers): string | null` and `readBodyWithinLimit(request: Request, maxBytes: number): Promise<Uint8Array>`.

- [ ] **Step 1: Write failing regression tests**

```ts
import { describe, expect, it } from "vitest";
import { safeEqual } from "./secrets";
import { safeUrl } from "./urls";
import { parseGtmId, parseMetricaId } from "./analytics";

it("rejects a same-prefix webhook secret", () => {
  expect(safeEqual("a".repeat(31), "a".repeat(32))).toBe(false);
});

it("does not render JavaScript CMS links", () => {
  expect(safeUrl("javascript:alert(1)", "/")).toBe("/");
});

it("rejects interpolated analytics payloads", () => {
  expect(parseGtmId("GTM-X');alert(1)//")).toBeNull();
  expect(parseMetricaId("1,init);alert(1)//")).toBeNull();
});
```

- [ ] **Step 2: Verify the tests fail because the modules do not exist**

Run: `cd frontend && npm test -- src/lib/security/secrets.test.ts src/lib/security/urls.test.ts src/lib/security/analytics.test.ts src/lib/security/request.test.ts`

Expected: Vitest reports unresolved imports for the new modules.

- [ ] **Step 3: Implement the narrow primitives**

```ts
export function safeEqual(received: string | null, expected: string): boolean {
  if (!received || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export function safeUrl(raw: string | null | undefined, fallback = "/"): string | null {
  if (!raw) return fallback;
  if (raw.startsWith("/")) return raw.startsWith("//") ? fallback : raw;
  try {
    const url = new URL(raw);
    return ["https:", "mailto:", "tel:"].includes(url.protocol) ? url.toString() : fallback;
  } catch { return fallback; }
}
```

`readBodyWithinLimit` must count stream chunks and throw a dedicated `RequestTooLargeError` before returning more than `maxBytes`; it must not rely on `Content-Length`. `getTrustedClientIp` must return `null` unless a single valid IP is supplied by the trusted local Caddy proxy.

- [ ] **Step 4: Verify focused tests pass**

Run: `cd frontend && npm test -- src/lib/security/secrets.test.ts src/lib/security/urls.test.ts src/lib/security/analytics.test.ts src/lib/security/request.test.ts`

Expected: all security primitive tests pass.

- [ ] **Step 5: Commit the focused change**

```bash
git add frontend/src/lib/security
git commit -m "feat: add reusable security primitives"
```

## Task 2: Fail-closed API boundaries and protected revalidation

**Files:**
- Modify: `frontend/src/lib/leads/schema.ts`
- Modify: `frontend/src/lib/orders/schema.ts`
- Modify: `frontend/src/app/api/leads/route.ts`
- Modify: `frontend/src/app/api/orders/route.ts`
- Modify: `frontend/src/app/api/revalidate/route.ts`
- Create: `frontend/src/lib/security/turnstile.ts`
- Create: `frontend/src/lib/security/turnstile.test.ts`
- Modify: `frontend/src/lib/leads/schema.test.ts`
- Modify: `frontend/src/lib/orders/schema.test.ts`
- Create: `frontend/src/app/api/revalidate/route.test.ts`

**Interfaces:**
- Consumes Task 1 `safeEqual`, `requireProductionSecret`, `getTrustedClientIp`, and `readBodyWithinLimit`.
- Produces `verifyTurnstile({ token, remoteIp }): Promise<boolean>` and routes that return `400` when production CAPTCHA is unconfigured or missing.

- [ ] **Step 1: Write failing tests for production failure modes**

```ts
it("requires a Turnstile token in production", () => {
  expect(makeLeadSchema("production").safeParse(validLead)).toMatchObject({ success: false });
});

it("rejects a revalidation request with a wrong-length secret", async () => {
  const response = await POST(new Request("https://site.test/api/revalidate", {
    method: "POST", headers: { "x-revalidate-secret": "short" },
    body: JSON.stringify({ collection: "products" }),
  }));
  expect(response.status).toBe(401);
});
```

- [ ] **Step 2: Verify the regressions fail against the audit behavior**

Run: `cd frontend && npm test -- src/lib/leads/schema.test.ts src/lib/orders/schema.test.ts src/app/api/revalidate/route.test.ts`

Expected: tests expose optional production CAPTCHA and direct string secret comparison.

- [ ] **Step 3: Implement route enforcement**

Use the Task 1 byte-limited reader before JSON parsing. Require `TURNSTILE_SECRET_KEY` and `REVALIDATE_SECRET` to be present and at least 32 characters in production. Use `safeEqual` for the revalidate header. Make schema construction explicit through a function that takes the runtime environment so production token requirements are testable. Remove `order_id` from the public order response.

- [ ] **Step 4: Verify route and schema tests pass**

Run: `cd frontend && npm test -- src/lib/leads/schema.test.ts src/lib/orders/schema.test.ts src/app/api/revalidate/route.test.ts`

Expected: invalid/missing CAPTCHA, malformed JSON, oversized chunked bodies, and mismatched webhook secrets are rejected.

- [ ] **Step 5: Commit the API-boundary change**

```bash
git add frontend/src/lib/leads frontend/src/lib/orders frontend/src/lib/security/turnstile.ts frontend/src/app/api
git commit -m "fix: fail closed at public API boundaries"
```

## Task 3: CMS rendering, analytics, CSP, and XSS controls

**Files:**
- Modify: `frontend/src/components/layout/Analytics.tsx`
- Create: `frontend/public/analytics-loader.js`
- Modify: `frontend/next.config.ts`
- Create: `frontend/src/app/api/csp-report/route.ts`
- Create: `frontend/src/components/layout/Analytics.test.tsx`
- Create: `frontend/src/proxy.csp.test.ts`
- Create: `frontend/src/app/api/csp-report/route.test.ts`
- Modify: all components identified by C5 to import and use `safeUrl`: `HeaderNavigation.tsx`, `MobileNavigation.tsx`, `Footer.tsx`, `HomeContentSections.tsx`, `HomeCategories.tsx`, `HomeFeatured.tsx`, `HomeArticles.tsx`, `HomeSelection.tsx`, `HomeCompanyTrust.tsx`, `HomeHero.tsx`, `HomeContactActions.tsx`.

**Interfaces:**
- Consumes Task 1 `safeUrl`, `parseGtmId`, and `parseMetricaId`.
- Uses validated analytics IDs only as React-escaped `data-*` attributes on a same-origin external script.

- [ ] **Step 1: Write failing tests for stored XSS and CSP enforcement**

```tsx
it("does not emit a script when the configured GTM ID is unsafe", () => {
  render(<Analytics gtmId={"GTM-X');alert(1)//"} />);
  expect(document.querySelector("script")).toBeNull();
});

it("sends an enforcing CSP without inline JavaScript exemptions", () => {
  const response = await headers();
  expect(response.get("Content-Security-Policy")).not.toContain("unsafe-inline");
  expect(response.headers.get("Content-Security-Policy-Report-Only")).toBeNull();
});
```

- [ ] **Step 2: Verify tests fail**

Run: `cd frontend && npm test -- src/components/layout/Analytics.test.tsx src/proxy.csp.test.ts src/app/api/csp-report/route.test.ts`

Expected: unsafe IDs render and the configuration only emits report-only CSP with inline/eval exemptions.

- [ ] **Step 3: Implement the static CSP and safe render path**

Return `Content-Security-Policy` rather than the report-only header. Set `script-src 'self' https://www.googletagmanager.com https://mc.yandex.ru`; remove `unsafe-inline` and `unsafe-eval`; add narrowly scoped `img-src`, `connect-src`, and `frame-src` entries for the same analytics origins. Replace the inline GTM/Metrica snippets with `/analytics-loader.js`, a same-origin static script that reads only validated `data-gtm-id` and `data-metrica-id` attributes and loads the matching allowlisted third-party URL. The CSP report route accepts only POST JSON below 16 KiB, logs violation directive and blocked origin without cookies, document URI query strings, or request bodies, then returns `204`.

Apply `safeUrl` at every C5 CMS `href`/URL boundary. Ensure unavailable or malformed link data renders no link or the existing same-site fallback rather than a `javascript:` URL.

- [ ] **Step 4: Verify XSS and CSP tests pass**

Run: `cd frontend && npm test -- src/components/layout/Analytics.test.tsx src/proxy.csp.test.ts src/app/api/csp-report/route.test.ts`

Expected: only regex-valid analytics IDs produce loader data attributes; CSP is enforcing without inline/eval exemptions; unsafe CMS links do not render executable schemes.

- [ ] **Step 5: Commit the XSS/CSP change**

```bash
git add frontend/src/components frontend/src/app/layout.tsx frontend/src/app/api/csp-report frontend/src/proxy.ts frontend/next.config.ts
git commit -m "fix: enforce CSP and validate CMS render data"
```

## Task 4: Application request limits and catalog/order correctness

**Files:**
- Create: `frontend/src/lib/security/rate-limit.ts`
- Create: `frontend/src/lib/security/rate-limit.test.ts`
- Modify: `frontend/src/proxy.ts`
- Modify: `frontend/src/app/api/catalog/suggestions/route.ts`
- Modify: `frontend/src/app/api/orders/route.ts`
- Modify: `frontend/src/lib/directus/orders.ts`
- Modify: `frontend/src/lib/catalog/search-params.ts`
- Modify: relevant route and Directus tests.

**Interfaces:**
- Produces `checkRateLimit(key: string, policy: { limit: number; windowMs: number }): { allowed: boolean; retryAfterSeconds: number }`.
- API policies: leads `5/hour/IP`, orders `10/hour/IP`, suggestions `30/minute/IP`, revalidate `30/minute/IP`.

- [ ] **Step 1: Write failing tests**

```ts
it("returns 429 after the lead IP reaches its five-request hourly budget", () => {
  for (let i = 0; i < 5; i++) expect(checkRateLimit("lead:203.0.113.8", leadPolicy).allowed).toBe(true);
  expect(checkRateLimit("lead:203.0.113.8", leadPolicy)).toMatchObject({ allowed: false });
});

it("caps suggestions before querying Directus", async () => {
  await expect(getSuggestions({ query: "filter", limit: -1 })).resolves.toHaveLength(20);
});
```

- [ ] **Step 2: Verify tests fail**

Run: `cd frontend && npm test -- src/lib/security/rate-limit.test.ts src/app/api/catalog/suggestions/route.test.ts src/app/api/orders/route.test.ts`

Expected: no limiter exists and suggestions retain their unbounded Directus query.

- [ ] **Step 3: Implement limits and bounded data access**

Apply the token bucket in `proxy.ts` before protected API handlers, return `429` with `Retry-After` and standard rate-limit headers, and use a bounded query length plus maximum 20 suggestions. Use an idempotency key generated server-side from validated order fields and a short-lived database/Directus lookup before creation; never expose Directus order IDs. Replace per-line Directus queries with one `id in (...)` product lookup and a bounded line-item count.

- [ ] **Step 4: Verify focused tests pass**

Run: `cd frontend && npm test -- src/lib/security/rate-limit.test.ts src/app/api/catalog/suggestions/route.test.ts src/app/api/orders/route.test.ts`

Expected: limits reject excess requests, catalog queries are bounded, and duplicate order submits reuse one stored order.

- [ ] **Step 5: Commit request-control changes**

```bash
git add frontend/src/lib/security/rate-limit.ts frontend/src/proxy.ts frontend/src/app/api/catalog frontend/src/app/api/orders frontend/src/lib/directus/orders.ts
git commit -m "fix: rate limit APIs and bound catalog orders"
```

## Task 5: Data-boundary fixes for redirects, media, cart, attachments, and JSON-LD

**Files:**
- Modify: `frontend/src/lib/directus/catalog.ts`
- Modify: category page and redirect handling files returned by `rg "redirect_target" frontend/src`
- Modify: `frontend/src/app/media/[fileId]/route.ts`
- Modify: `frontend/src/app/cart/page.tsx` and cart state helpers
- Modify: `frontend/src/lib/leads/attachments.ts`
- Modify: `frontend/src/lib/seo/schema.ts`
- Modify: corresponding `*.test.ts` files.

**Interfaces:**
- Consumes Task 1 `safeSameOriginPath` and `readBodyWithinLimit`.
- Produces attachment validation that verifies JPEG, PNG, WebP, PDF, XLSX/ZIP signatures independently of `File.type`.

- [ ] **Step 1: Write failing tests for each audited bypass**

```ts
it("rejects an external category redirect", () => {
  expect(safeSameOriginPath("https://evil.test/phish")).toBeNull();
});
it("rejects a spreadsheet whose declared MIME differs from bytes", async () => {
  expect(await validateLeadAttachment("spreadsheet", fakePdfNamedXlsx)).toContain("формат");
});
it("escapes all JavaScript-breaking JSON-LD characters", () => {
  expect(stringifyJsonLd({ name: "<>&\u2028\u2029" })).not.toContain("<");
});
```

- [ ] **Step 2: Verify tests fail**

Run: `cd frontend && npm test -- src/app/media/[fileId]/route.test.ts src/lib/leads/attachments.test.ts src/lib/seo/schema.test.ts`

Expected: current code accepts unsafe redirect/MIME values or leaves at least one JSON-LD breaker unescaped.

- [ ] **Step 3: Implement constrained parsing and authorization**

Only redirect to an approved same-origin relative path. Require media file IDs to match a UUID format and use a Directus public-folder/file ownership filter rather than an unrestricted admin-token proxy. Validate persisted cart JSON with Zod before rendering and discard malformed entries. Verify upload magic bytes before upload; reject unsupported signatures. Validate numeric prices as finite positive values and escape `<`, `>`, `&`, U+2028, and U+2029 in JSON-LD serialization.

- [ ] **Step 4: Verify focused tests pass**

Run: `cd frontend && npm test -- src/app/media/[fileId]/route.test.ts src/lib/leads/attachments.test.ts src/lib/seo/schema.test.ts`

Expected: malicious redirects, file IDs, cart JSON, MIME claims, and JSON-LD payloads are safely rejected or normalized.

- [ ] **Step 5: Commit data-boundary change**

```bash
git add frontend/src/app/media frontend/src/app/cart frontend/src/lib/directus/catalog.ts frontend/src/lib/leads/attachments.ts frontend/src/lib/seo/schema.ts
git commit -m "fix: validate media, cart, redirects and structured data"
```

## Task 6: Directus access control and credential lifecycle

**Files:**
- Modify: `directus/access/blueprint.mjs`
- Modify: `directus/access/apply-access.mjs`
- Modify: `directus/access/*.test.mjs`
- Modify: `directus/schema/snapshot.json`
- Modify: `directus/schema/*test.mjs`
- Modify: `directus/create-frontend-token.mjs`
- Modify: `directus/docker-compose.yml`
- Modify: `directus/.env.example`

**Interfaces:**
- Produces a snapshot-tested Frontend API role that can create leads and upload only into its assigned folder, with no broad `directus_files` update permission.
- Produces a token generator using `randomBytes(32)` that returns the token only through process output intended for a secure operator pipe, never normal logs.

- [ ] **Step 1: Write failing Directus policy and token tests**

```js
assert.equal(frontendFilesUpdate.fields.includes("folder"), true);
assert.equal(frontendFilesUpdate.permissions.folder._eq, "${DIRECTUS_UPLOAD_FOLDER_ID}");
assert.match(source, /randomBytes\(32\)/);
assert.doesNotMatch(source, /Date\.now\(\)/);
assert.doesNotMatch(source, /console\.log\(token\)/);
```

- [ ] **Step 2: Verify tests fail**

Run: `node directus/access/blueprint.test.mjs && node directus/access/apply-access.test.mjs && node directus/schema/snapshot-schema.test.mjs`

Expected: the current role permits broad file updates and the token source uses a timestamp/logging.

- [ ] **Step 3: Implement least privilege and safe token rotation**

Update the policy blueprint and generated snapshot together. Limit file update fields to `folder` and require the configured upload folder. Make the development Directus bind `127.0.0.1:8055:8055`, set strong password/cookie/rate-limit environment settings, and disable WebSockets unless a documented authenticated feature needs them. Generate a 256-bit random token and write it only to a path passed by a root-owned `DIRECTUS_TOKEN_OUTPUT_FILE` variable with mode `0600`; print a redacted success message.

- [ ] **Step 4: Verify Directus tests pass**

Run: `node directus/access/blueprint.test.mjs && node directus/access/apply-access.test.mjs && node directus/schema/snapshot-schema.test.mjs && node directus/schema/platform-compatibility.test.mjs`

Expected: policies are reproducible, folder-limited, and token generation no longer has predictable entropy or stdout disclosure.

- [ ] **Step 5: Commit Directus policy change**

```bash
git add directus/access directus/schema directus/create-frontend-token.mjs directus/docker-compose.yml directus/.env.example
git commit -m "fix: harden Directus access and token rotation"
```

## Task 7: Production Compose, Caddy, and deployment hardening

**Files:**
- Modify: `deploy/compose.production.yml`
- Modify: `deploy/Caddyfile`
- Modify: `deploy/deploy.sh`
- Modify: `deploy/.env.production.example`
- Modify: `deploy/caddyfile.test.mjs`
- Modify: `deploy/deploy.test.mjs`
- Create: `deploy/Dockerfile.caddy`
- Create: `deploy/compose.production.test.mjs`

**Interfaces:**
- Consumes an absolute `env_file` at `/opt/jd-landing/.env` owned by root with mode `0600`.
- Uses a Caddy image built with the vetted rate-limit module, configured per path with the Task 4 policies, and applies Basic Auth only when an operator injects `DIRECTUS_ADMIN_BASIC_AUTH_HASH`.

- [ ] **Step 1: Write configuration tests before changing deployment files**

```js
assert.match(compose, /env_file:\s*\n\s*- \/opt\/jd-landing\/.env/);
assert.doesNotMatch(compose, /DIRECTUS_TOKEN:\s*\$\{/);
assert.match(caddy, /Strict-Transport-Security/);
assert.match(caddy, /rate_limit/);
assert.doesNotMatch(caddy, /http:\/\/91\.227\.68\.176/);
assert.match(compose, /cap_drop:\s*\n\s*- ALL/);
```

- [ ] **Step 2: Verify configuration tests fail**

Run: `node deploy/caddyfile.test.mjs && node deploy/deploy.test.mjs && node deploy/compose.production.test.mjs`

Expected: current config exposes secrets inline, accepts plain IP HTTP, and lacks rate, capability, and resource controls.

- [ ] **Step 3: Implement layered infrastructure controls**

Replace inline secret variables with `env_file`; retain only non-sensitive wiring values in Compose. Add per-service `read_only` where supported, `security_opt: ["no-new-privileges:true"]`, `cap_drop: ["ALL"]`, explicit writable tmpfs/volumes, memory/CPU/PID limits, and JSON log rotation. Add a Caddy healthcheck, HSTS in the shared header snippet, trusted proxy configuration, admin login protection, and no plain-IP site block. Build Caddy from a pinned source module, pin runtime images by digest after the deploy operator supplies verified digests, and retain an image/tag mapping comment without a live secret. Use Caddy admin on loopback and `caddy reload` instead of recreation. Update deployment parsing to load the env file inside the privileged shell, reject missing/placeholder required values, and avoid passing values to process argv.

- [ ] **Step 4: Verify configuration tests pass**

Run: `node deploy/caddyfile.test.mjs && node deploy/deploy.test.mjs && node deploy/compose.production.test.mjs && docker compose -f deploy/compose.production.yml config --quiet`

Expected: configuration tests confirm the new controls and Compose parses with a non-secret local test environment.

- [ ] **Step 5: Commit infrastructure hardening**

```bash
git add deploy
git commit -m "fix: harden production proxy and containers"
```

## Task 8: Encrypted automated backups and restore runbook

**Files:**
- Modify: `deploy/backup.sh`
- Create: `deploy/systemd/jd-landing-backup.service`
- Create: `deploy/systemd/jd-landing-backup.timer`
- Create: `deploy/backup.test.mjs`
- Modify: `deploy/.env.production.example`
- Modify: `DEPLOY.md`
- Modify: `deploy/README.md`

**Interfaces:**
- Requires `RESTIC_REPOSITORY`, `RESTIC_PASSWORD_FILE`, and provider credentials available only in `/opt/jd-landing/.env` or a root-only credentials file.
- Produces encrypted daily database/upload snapshots, local retention of 14 days, remote retention of 90 daily snapshots, and a documented monthly staging restore command.

- [ ] **Step 1: Write failing script/configuration tests**

```js
assert.match(script, /restic backup/);
assert.match(script, /RESTIC_PASSWORD_FILE/);
assert.match(timer, /OnCalendar=\*-\*-\* 03:00:00/);
assert.match(runbook, /restic restore.*staging/s);
assert.doesNotMatch(script, /set -a\s*\n\. \.\/\.env/);
```

- [ ] **Step 2: Verify backup tests fail**

Run: `node deploy/backup.test.mjs`

Expected: the current script only creates unencrypted local archives and no timer exists.

- [ ] **Step 3: Implement backup and restore behavior**

Make `backup.sh` require a root-owned env file and Restic settings, create a PostgreSQL custom dump and upload archive in a private temporary directory, send both through `restic backup`, run `restic forget --keep-daily 90 --prune`, and remove local temporary data using a trap. The script exits non-zero if remote encryption is unconfigured or any backup command fails. The systemd service runs as a dedicated backup user with a restricted supplementary Docker access strategy; the timer runs daily at 03:00 with persistent missed-run behavior. Document exact staging restore and verification steps.

- [ ] **Step 4: Verify backup tests pass**

Run: `node deploy/backup.test.mjs && shellcheck deploy/backup.sh`

Expected: tests prove encrypted remote snapshots and scheduled execution; shellcheck reports no errors.

- [ ] **Step 5: Commit backup implementation**

```bash
git add deploy/backup.sh deploy/systemd deploy/backup.test.mjs deploy/.env.production.example DEPLOY.md deploy/README.md
git commit -m "feat: add encrypted automated backups"
```

## Task 9: Remaining audit hygiene, observability hooks, and dependency remediation

**Files:**
- Modify: `frontend/src/lib/notifications/notify.ts`
- Modify: `frontend/src/lib/articles/sanitize.test.ts`
- Modify: `frontend/src/lib/seo/indexnow.ts`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `DEPLOY.md`, `HANDOFF.md`, `commit-push.bat`, `deploy/Caddyfile`, `deploy/.env.production.example`
- Create: `deploy/monitoring/README.md`
- Modify: tests adjacent to each source file.

**Interfaces:**
- SMTP error logs contain only a sanitized message and endpoint metadata, never raw transporter objects or credentials.
- Sanitizer tests cover scheme obfuscation, data URLs, SVG/mXSS payloads, and safe external link rel attributes.

- [ ] **Step 1: Write failing security-hygiene tests**

```ts
it("redacts SMTP transport details from notification errors", async () => {
  await notifyWithFailingTransport();
  expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining("password"));
});

it("removes encoded JavaScript and SVG data URL payloads", () => {
  expect(sanitizeArticle('<a href="jAvAsCrIpT:alert(1)">x</a><svg><use href="data:text/html,x"/></svg>')).not.toContain("javascript:");
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `cd frontend && npm test -- src/lib/notifications/notify.test.ts src/lib/articles/sanitize.test.ts src/lib/seo/indexnow.test.ts`

Expected: tests identify over-detailed logging or sanitizer/indexNow gaps.

- [ ] **Step 3: Implement hygiene fixes**

Log a normalized error message only, derive IndexNow protocol from `NEXT_PUBLIC_SITE_URL`, and expand sanitizer regression coverage. Run `npm audit --omit=dev`; if it identifies an available `nanoid` remediation, update only the locked dependency chain and add the resulting lockfile. Replace public IPs, SSH users, paths to private keys, and business emails in documentation/examples with clear placeholders. Add monitoring setup instructions for an operator-managed Sentry DSN and uptime checks without committing either endpoint.

- [ ] **Step 4: Verify hygiene and dependency checks pass**

Run: `cd frontend && npm test -- src/lib/notifications/notify.test.ts src/lib/articles/sanitize.test.ts src/lib/seo/indexnow.test.ts && npm audit --omit=dev`

Expected: targeted tests pass and audit output contains no high or critical production vulnerability.

- [ ] **Step 5: Commit audit hygiene**

```bash
git add frontend deploy DEPLOY.md HANDOFF.md commit-push.bat
git commit -m "chore: close remaining security audit findings"
```

## Task 10: Full verification and audit closure

**Files:**
- Modify: `SECURITY-AUDIT.md` only if the project owner decides to track it; otherwise create `docs/implementation/security-audit-closure-2026-08-11.md`.
- Modify: `docs/implementation/security-audit-closure-2026-08-11.md`.

**Interfaces:**
- Produces an evidence table mapping every C/H/M/L identifier to a source change, regression test, and operational verification command.

- [ ] **Step 1: Create the audit evidence table before final runs**

```md
| Finding | Source control | Automated evidence | Operator verification |
| --- | --- | --- | --- |
| C1 | `lib/security/turnstile.ts` | `turnstile.test.ts` | production form rejects missing token |
| C9 | `deploy/backup.sh` | `backup.test.mjs` | restore into staging succeeds |
```

- [ ] **Step 2: Run the complete local verification set**

Run: `cd frontend && npm test && npm run lint && npm run typecheck && npm run build && npm audit --omit=dev`

Run: `node directus/access/blueprint.test.mjs && node directus/access/apply-access.test.mjs && node directus/schema/blueprint.test.mjs && node directus/schema/snapshot-schema.test.mjs`

Run: `node deploy/caddyfile.test.mjs && node deploy/deploy.test.mjs && node deploy/compose.production.test.mjs && node deploy/backup.test.mjs`

Expected: every command exits `0`; audit reports zero high/critical production vulnerabilities.

- [ ] **Step 3: Validate generated deployment configuration without secrets**

Create a temporary local environment file containing only non-secret test values, then run:

```bash
docker compose --env-file deploy/.env.production.example -f deploy/compose.production.yml config --quiet
```

Expected: Compose parses and no real values appear in output.

- [ ] **Step 4: Record operational checks that require production authority**

Record completion only after an operator has set root ownership/mode `0600` on `/opt/jd-landing/.env`, provided real Directus Basic Auth/IP controls, configured Restic remote credentials, performed a staging restore, and confirmed HTTP headers/rate limits against the deployed hostname.

- [ ] **Step 5: Commit the closure evidence**

```bash
git add docs/implementation/security-audit-closure-2026-08-11.md
git commit -m "docs: record security audit verification"
```

## Plan Self-Review

- Coverage: Tasks 1–5 cover application C1–C6, H1–H8, M1–M2, M5, M10, L2–L5, and L8–L9. Tasks 6–7 cover Directus and infrastructure C7–C8, C10, H9–H14, M3–M9, and M12–M14. Task 8 covers C9 and M11. Task 9 covers remaining low findings and monitoring. Task 10 maps all 49 findings to evidence.
- No-placeholder scan: every implementation step is concrete; production-only credentials are intentionally external inputs and have explicit failure behavior.
- Interface consistency: Tasks 2–5 consume the Task 1 exports exactly as named; rate-limit policies are defined by Task 4 and applied by `proxy.ts`; Task 3 validates analytics IDs before writing them as attributes consumed by the static loader.
