# All Requests Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this bounded task. Owner policy uses one fresh independent review and one bounded fix pass.

**Goal:** Email all accepted website request types to the existing recipient without coupling ordinary lead mail to CMS availability.
**Architecture:** Reuse the notification transport/template and validated API handlers. Return an internal canonical order notification snapshot from persistence; keep the public checkout response unchanged. Email bounded validated attachment bytes directly.
**Tech Stack:** Next.js App Router, TypeScript, Nodemailer, Vitest; existing versions only.
**Spec:** docs/superpowers/specs/2026-10-27-all-requests-email-design.md

## Global Constraints
- BASE: 0b5a51632dd361f95e78ea5459bdb0f1eb8505af; branch codex/all-requests-email-20261027.
- Exact allowed production/test files: frontend/src/app/api/leads/route.ts and route.test.ts; frontend/src/app/api/orders/route.ts and route.test.ts; frontend/src/lib/directus/orders.ts and orders.test.ts; frontend/src/lib/notifications/notify.ts and notify.test.ts; frontend/src/lib/notifications/render.ts and render.test.ts; frontend/src/test/smtp-fixture.ts; frontend/src/test/mail-delivery.integration.test.ts.
- Allowed documentation: this plan and its spec only. Any other source file is a STOP requiring lead adjudication before editing.
- No dependencies, roles, schema, auth/CAPTCHA/body/rate limits, env or deployment config changes. No production test submissions or real email.
- Existing explicit no-main-merge remains: publish a feature PR against fix/audit-conversion-seo and preserve PR3 to main open. Deploy one scoped reviewed commit; other services remain unchanged.

## Review Focus
- CMS 403 or file-upload failure must not discard valid lead email or attachment contents.
- Client-submitted order prices/titles must never become authoritative mail content.
- SMTP failure after persistence must not generate a failed checkout/duplicate order.
- Invalid/spam/CAPTCHA-denied/over-limit requests must not send mail.
- Escaped HTML, truthful storage/attachment copy, safe filenames and no private-token leakage.

## Task 1: Complete request notifications
**Interfaces:** preserve notifyNewLead contact API compatibility; extend its payload for validated email attachments/context. Add an order-notification payload or helper in the same notification module. createOrder returns id plus an INTERNAL canonical snapshot; /api/orders returns only the existing public id. Keep DTO type scope minimal.

- [x] Add valuable failing regression tests for CMS-denied lead -> email success, two-channel failure, attachment survival/cleanup and canonical cart notification. Run the narrow tests to confirm the new requirements fail.
- [x] Implement normal/bulk lead notification independently of CMS writes; preserve existing contact and successful persistence semantics.
- [x] Add canonical cart notification from persisted snapshots, once after all items succeed. Preserve order success if mail fails.
- [x] Render complete escaped HTML/plain order details and real MIME attachments; storage-status wording must match actual outcomes.
- [x] Add a small real local SMTP fixture and integration cases that exercise actual API handlers, actual Nodemailer and captured MIME. Keep the fixture isolated from production addresses and external network.
- [x] Run narrow checks; return exact evidence, files changed and unresolved risks. Do not commit/push or run full build in the worker.

## Lead verification and publication
- [x] Inspect actual diff against allowed scope, then run npm run lint; npm run typecheck; npm run test:ci -- --maxWorkers=2; production npm run build with unreachable CMS and public site URL.
- [x] Fresh independent reviewer; bounded in-scope fix pass plus narrow closure check for any confirmed findings.
- [ ] Commit once, push scoped branch, create/attach PR against fix/audit-conversion-seo, merge only that feature PR, preserve original PR3 to main.
- [ ] Deploy exact commit via the already validated isolated frontend procedure, preserving the previous image and protected hashes. Verify public routes and frontend health; no real form submissions/mail.
- [ ] Record actual SHA/PR/tests/deploy/rollback and cleanup status. Archive only this new task worktree after its merged source is preserved; keep existing worktrees untouched.

## Execution ledger
- Prepared fresh worktree from current origin/main and fast-forwarded the already deployed 0b5a516 as the dependency. No production source edits yet.
- Ruling: retain saved-order success on SMTP failure to prevent duplicate persisted orders; do not introduce outbox/schema changes.

- Lead inspected actual diff and scope: PASS. Lint and typecheck: PASS. Full suite after corrective pass: 106 files / 608 tests PASS (56.27 s). The mock lifecycle timeout was reproduced and fixed without raising timeouts. Real Node multipart request and SMTP capture verify file bytes and canonical order context.


- Production build with unreachable CMS and https://deere-shop.ru: PASS. Fresh independent reviewer found no confirmed P0/P1/P2, no further fixes needed. No broad suite repeated after this clean review. Protected files and dependency versions remain unchanged.
