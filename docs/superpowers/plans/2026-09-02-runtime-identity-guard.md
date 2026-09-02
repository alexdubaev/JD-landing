# Runtime Identity Guard Implementation Plan

> **For agentic workers:** Execute each step with the named test first. Do not touch
> Directus, environment values, Docker, Caddy, VPS configuration, `deploy/`, catalogue
> data or frontend components.

**Goal:** Make an unsafe local test launch fail before it can present an ambiguous
version, data source or publication target.

**Architecture:** A small dependency-injected Node module derives Git identity and
validates an explicit launch request. A CLI wrapper validates then starts `next dev`
with only the declared branch-local environment file. Tests use a fake Git/process
adapter so no real environment secrets or remote state are required.

**Tech Stack:** Node.js built-ins, `node:test`, existing Next.js dev command.

## Scope

- Allowed: `scripts/runtime-identity.mjs`, `scripts/start-test-runtime.mjs`, their
  tests, `scripts/review-runtime-targets.mjs`, `scripts/runtime-status.mjs`,
  `scripts/show-test-runtime.mjs`, their tests, `config/review-runtime-targets.json`,
  `.openai/hosting.json`, `frontend/package.json` (the dev command only), `AGENTS.md`,
  this plan/spec, and `docs/runbooks/test-runtime.md`.
- Protected: Directus, `.env*`, Docker, Caddy, VPS, `deploy/`, dependencies, catalogue,
  frontend UI and all routes.
- Verification: node tests; a dry run for a local-only SHA; source-scope diff check.

### Task 1 — Identity validator

1. Add failing tests for `main`, dirty status, branch/SHA mismatch and external env.
2. Run `node --test scripts/runtime-identity.test.mjs` and record RED.
3. Implement the pure validator and Git adapter boundary.
4. Run the same test command and record GREEN.

### Task 2 — Safe launch CLI

1. Add failing CLI test: a valid request prints the receipt; an occupied port is
   refused before Next is spawned.
2. Run `node --test scripts/start-test-runtime.test.mjs` and record RED.
3. Implement argument parsing, port check, receipt and `next dev` spawn.
4. Run the focused tests and a dry run that must reject the current local-only SHA.

### Task 3 — Operator runbook

1. Document authoritative version identities, branch-local config, the printed Directus
   URL, the closed review-origin allowlist, and exact `@Sites` project binding.
2. Verify the command examples use no environment values and no raw public IP port.
3. Inspect `git diff --name-only` against the allowed scope, run all script tests and
   request an independent review before commit.
