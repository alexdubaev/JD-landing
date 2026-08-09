# plan1.md implementation ledger

## Scope lock

- Preserve the existing DEERE-SHOP technical manifesto: graphite/dark-green surfaces, thin borders, yellow only for decisive actions, dense engineering typography, real product photography.
- Keep Directus as the content source. Never invent legal details, VAT status, delivery history, prices, availability, response times, or official John Deere status.
- Do not render recent supplies until real CMS records exist.
- Hide incomplete featured products instead of filling missing commercial data with claims.
- Refero research was attempted on 2026-08-01 but the MCP returned `NO_SUBSCRIPTION`; decisions below therefore lock to the shipped design system and plan1.md.

## Visual reference lock

- Primary direction: current sharp industrial catalog, compacted rather than redesigned.
- Preserve: square/low-radius controls, thin dividers, dark-green hero/header accents, yellow CTA role, image-led hero, restrained motion.
- Borrowed interaction patterns: command-like search with an embedded submit action; split bulk-RFQ workbench; add-to-request controls that remain secondary to product details.
- Explicit rejects: decorative gradients over the hero, soft SaaS card stacks, invented trust badges, decorative icon blobs, indigo/violet, parallax/pinning, fake photography.
- Density tokens: 72-80 px header, 44 px minimum targets, 16 px body minimum, compact section rhythm using existing `--technical-section` policy.

## Tasks

### Task 1 — Audit and baseline

- [x] Read plan1.md and relevant project/skill instructions.
- [x] Create isolated worktree `codex/plan1-homepage`.
- [x] Install dependencies.
- [x] Baseline: 30 test files, 70 tests passed.
- [x] Audit current header, hero search, homepage composition, Directus types, leads API, cards, process, FAQ, contacts and footer.

### Task 2 — Header, hero, benefits and categories

- [x] Compact sticky desktop header with active navigation, phone and request CTA.
- [x] Mobile menu and contact/request affordances.
- [x] Hero copy/search normalization/scenarios without legal disclaimer.
- [x] Four exact evidence-led benefits.
- [x] Curated eight-category homepage with catalog link.
- [x] Tests.

### Task 3 — Bulk parts request

- [x] Persistent 1-100 line parser with dedupe and quantities.
- [x] XLS/XLSX/CSV validation, photo attachment, remove/clear states.
- [x] Server multipart validation and Directus lead submission.
- [x] Tests.

### Task 4 — Remaining homepage and structured data

- [x] Product request list/copy SKU/commercial fields with conditional rendering.
- [x] Exact four-step selection process.
- [x] CMS-only company trust block and conditional recent supplies.
- [x] Knowledge base cards, 12-question FAQ, final CTA and mobile action bar.
- [x] Organization/WebSite/SearchAction/FAQ/Product schema and analytics adapter.
- [x] Tests.

### Task 5 — Verification

- [x] Unit/integration suite, typecheck, lint and production build.
- [x] Browser QA at 1920, 1440, tablet and narrow-phone responsive breakpoints.
- [x] Screenshots and final diff review.

## Decisions and constraints

- Uploaded spreadsheet files are preserved as lead attachments; CSV text can be inspected client-side, while binary XLS/XLSX is validated and sent without pretending it was parsed in the browser.
- Factual company/requisite fields are optional Directus fields and render only when populated.
- Existing GSAP process motion stays transform/opacity-only and honors reduced motion.

## Progress log

- 2026-08-01: baseline completed; Refero unavailable; reference lock created.
- 2026-08-01: Tasks 2-4 implemented with independent review after each batch; 128 frontend and 39 Directus tests pass.
- 2026-08-01: production build, typecheck, lint and browser screenshots completed; final narrow-phone containment override added after visual QA.
- 2026-08-01: final whole-branch review findings resolved: CMS visibility, Turnstile retry handling, bounded multipart requests, unambiguous quantity parsing, stale search results and analytics semantics.
