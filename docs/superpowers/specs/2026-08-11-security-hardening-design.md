# Security Hardening Design

**Status:** Approved for planning

## Goal

Close every finding in `SECURITY-AUDIT.md` through two independently deployable phases without adding secrets, real infrastructure credentials, or unreviewed public access.

## Scope and release order

### Phase 1 — production blockers and high-risk surfaces

This phase covers C1–C10 and H1–H15.

- Make Turnstile and deployment-secret validation fail closed in production.
- Validate all CMS-fed URLs and analytics IDs before rendering or fetching.
- Replace unsafe secret comparison with constant-time comparison.
- Enforce a static CSP without `unsafe-inline` or `unsafe-eval`; move analytics bootstrapping into a self-hosted external script and add report handling.
- Add application-level request rate limiting to API routes and configure Caddy/Directus with the corresponding edge and admin protections.
- Bound request body sizes based on bytes actually received, not just `Content-Length`.
- Prevent mass assignment, open redirects, unsafe remote image origins, media-proxy enumeration, and exposed order identifiers.
- Version Directus access controls and narrow file permissions.
- Move secret values out of Compose `environment:` declarations into a root-readable `env_file`; make deployment reject placeholders and missing required production values.
- Harden containers with health checks, resource limits, dropped capabilities, no-new-privileges, log rotation, and immutable image references where a digest is available.

### Phase 2 — operational hardening and defence in depth

This phase covers M1–M14 and L1–L10.

- Remove remaining CSP relaxations, validate persisted cart data, verify attachment signatures, and validate JSON-LD scalar values.
- Limit Directus development exposure, add trusted-proxy handling, enforce HSTS at the CMS edge, and reduce deployment downtime.
- Add encrypted, automated backup jobs with retention, off-server Restic configuration templates, and documented restore verification.
- Redact infrastructure identifiers from public documentation and improve error observability without logging sensitive values.
- Update vulnerable dependencies only through lockfile-reviewed changes and prove build/test compatibility.

## Architecture

Security logic is grouped into focused, server-safe modules:

- `lib/security/secrets`: production environment validation and constant-time comparison.
- `lib/security/turnstile`: shared verification that is permissive only outside production.
- `lib/security/urls`: allowlisted relative, mail, tel, and HTTPS URL normalization for CMS content.
- `lib/security/analytics`: strict GTM and Metrica identifier validators.
- `lib/security/request-limits`: IP extraction from trusted headers, byte-limited request readers, and pluggable token-bucket limits.

API routes consume parsed server-side data only. The Next proxy applies early API limits; a self-hosted analytics loader reads validated data attributes and may load only the analytics origins explicitly named by the static CSP. This preserves ISR/SSG, which a per-request nonce would disable in Next.js App Router. Caddy and Directus add independent request/admin controls. Docker Compose consumes a protected env file and constrains containers. Backup tooling uses Restic only when an explicitly configured encrypted remote repository is available.

## Trust boundaries and abuse cases

| Boundary | Abuse case | Required control |
| --- | --- | --- |
| Visitor → API | Spam, large chunked body, forged UTM/page URL | byte limits, strict Zod schemas, token bucket, Turnstile fail-closed |
| Directus → frontend render | `javascript:` link or JavaScript injected into analytics ID | URL and identifier validation before output |
| Directus webhook → revalidation | guessed secret or cache-purge flood | constant-time secret check, minimum secret length, rate limit |
| Internet → Directus admin | password brute force | Caddy protection, Directus rate limiting, password policy, secure cookies |
| VPS/Docker → services | secret exposure or compromised container | `env_file`, least privilege, capabilities dropped, resource/log limits |
| VPS → backups | data loss or PII disclosure | encrypted remote Restic repository, timer, retention, restore runbook |

## Constraints

- Production security checks fail closed; development retains only deliberate local fallbacks.
- No credential, access-control hash, IP allowlist, or backup repository URL is committed.
- New production behavior is introduced test-first; each security module has regression tests for the audited bypass.
- All existing application and configuration tests remain green; TypeScript and production builds must pass.
- Existing untracked `.tmp/` and `SECURITY-AUDIT.md` remain untouched.

## Verification

Phase 1 verification includes focused unit/route/configuration tests, the full frontend test suite, lint, typecheck, production build, and dependency audit. Phase 2 additionally verifies backup-script failure modes and documents a real staging restore test required before production launch.
