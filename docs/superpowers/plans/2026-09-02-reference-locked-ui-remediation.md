# Reference-Locked DEERE-SHOP UI Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Repair responsive presentation of the homepage, catalog, and service pages against approved UI-01…UI-14 without changing CMS or application behavior.

**Architecture:** Keep server data paths and interactions intact. Presentation components expose stable CSS hooks and semantic structure; one final CSS layer owns responsive layout, spacing, typography, and safe-area rules. An explicit service-page selector handles only delivery, contacts, and about; other informational pages retain ContentPageView.

**Tech Stack:** Next.js App Router, TypeScript, React 19, CSS, Vitest, Testing Library.

**Spec:** docs/superpowers/specs/2026-09-02-reference-locked-ui-remediation-design.md

## Global Constraints

- Do not modify Directus, APIs, order/lead/security processing, dependencies, lockfiles, next.config.ts, environment files, deploy/, Docker, Caddy, or infrastructure.
- CMS strings, product/category data, contacts, URLs, analytics handlers, and image IDs remain authoritative.
- Do not introduce invented imagery or substitute missing factual media with decoration.
- Use the existing Inter stack; do not add a font package.
- Every behaviour change starts with a focused failing test and verifies RED then GREEN.
- Do not deploy, push, merge, submit forms, or transmit personal data.

---

### Task 1: Home hero and mobile navigation semantics

**Files:**
- Modify: frontend/src/components/sections/HomeHero.tsx
- Modify: frontend/src/components/sections/HeroPartSearch.tsx
- Modify: frontend/src/components/layout/MobileNavigation.tsx
- Modify: frontend/src/components/sections/HomeHero.test.tsx
- Modify: frontend/src/components/sections/HeroPartSearch.test.tsx
- Create: frontend/src/components/layout/MobileNavigation.test.tsx

**Interfaces:** Consumes existing PageSection, ContactChannel[], and SiteSettings props. Produces .commerce-hero__mobile-media, .commerce-hero__proof-rail, and Escape-operable MobileNavigation. Existing search URLs/events remain unchanged.

- [ ] Step 1 — write failing tests:
  expect(screen.getByTestId("hero-mobile-media")).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("navigation", { name: "Мобильная навигация" })).not.toBeInTheDocument();

- [ ] Step 2 — run RED:
  npm test -- src/components/sections/HomeHero.test.tsx src/components/sections/HeroPartSearch.test.tsx src/components/layout/MobileNavigation.test.tsx
  Expected: failure because the media hook and Escape focus behavior are absent.

- [ ] Step 3 — implement minimal semantic hooks:
  <div className="commerce-hero__mobile-media" data-testid="hero-mobile-media">…</div>
  <div className="commerce-hero__proof-rail" aria-label="Преимущества">…</div>
  On Escape, setIsOpen(false) and toggleRef.current?.focus(). Keep form names, destinations, tracking, and accessible labels unchanged.

- [ ] Step 4 — run the same focused command and confirm PASS.

- [ ] Step 5 — commit only the files listed above:
  git commit -m "fix(frontend): restore responsive hero controls"

### Task 2: Process, company trust, and mobile action-bar structure

**Files:**
- Modify: frontend/src/components/sections/HomeSelection.tsx
- Modify: frontend/src/components/sections/HomeCompanyTrust.tsx
- Modify: frontend/src/components/sections/HomeContactActions.tsx
- Modify: frontend/src/components/sections/HomeSelection.test.tsx
- Modify: frontend/src/components/sections/HomeCompanyTrust.test.tsx
- Modify: frontend/src/components/sections/HomeContactActions.test.tsx

**Interfaces:** Consumes existing section items, SiteSettings, and published contacts. Produces .home-selection__rail, factual .home-company-trust__facts, and an action bar whose actions equal published available actions.

- [ ] Step 1 — write failing tests:
  expect(screen.getByRole("list", { name: "Этапы подбора" })).toHaveClass("home-selection__rail");
  expect(screen.queryByText(settings.legalAddress!)).not.toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Быстрые действия" }).querySelectorAll("a")).toHaveLength(2);

- [ ] Step 2 — run RED:
  npm test -- src/components/sections/HomeSelection.test.tsx src/components/sections/HomeCompanyTrust.test.tsx src/components/sections/HomeContactActions.test.tsx

- [ ] Step 3 — use an ordered list for process and render only legal name, INN, VAT, phone/hours, configured document links in the company dossier. Keep long legal address out of the homepage.

- [ ] Step 4 — run the same command and confirm PASS.

- [ ] Step 5 — commit only the files listed above:
  git commit -m "fix(frontend): structure factual home conversion blocks"

### Task 3: Catalog-card decision hierarchy

**Files:**
- Modify: frontend/src/components/catalog/ProductCard.tsx
- Modify: frontend/src/components/catalog/ProductCard.test.tsx
- Modify: frontend/src/components/catalog/ProductCard.variants.test.tsx

**Interfaces:** Consumes ProductCardData and produces .product-card__facts containing title, SKU, commercial status, and actions in source order. It makes no data-mapping change.

- [ ] Step 1 — write a failing test:
  const facts = screen.getByTestId("product-card-facts");
  expect(facts).toHaveTextContent("Артикул: RE174130");

- [ ] Step 2 — run RED:
  npm test -- src/components/catalog/ProductCard.test.tsx src/components/catalog/ProductCard.variants.test.tsx

- [ ] Step 3 — group title, SKU, price/status, and details action in:
  <div className="product-card__facts" data-testid="product-card-facts">…</div>
  Preserve route, transforms, cart/request handlers, price/status logic, and tracking. Do not clamp title, SKU, price/status, or primary action.

- [ ] Step 4 — run the same command and confirm PASS.

- [ ] Step 5 — commit only the files listed above:
  git commit -m "fix(frontend): clarify product card decisions"

### Task 4: Route-specific service-page presentation

**Files:**
- Create: frontend/src/components/pages/ServicePageView.tsx
- Create: frontend/src/components/pages/ServicePageView.test.tsx
- Modify: frontend/src/app/[infoSlug]/page.tsx
- Modify: frontend/src/app/[infoSlug]/page.test.tsx

**Interfaces:** Consumes ContentPage, FaqItem[], SiteSettings, and existing infoSlug selection. Produces ServicePageView only for delivery, contacts, and about; other slugs still render ContentPageView.

- [ ] Step 1 — write failing tests:
  expect(screen.getByRole("main")).toHaveClass("service-page", "service-page--delivery");
  expect(screen.getByRole("heading", { level: 1, name: page.h1 })).toBeInTheDocument();

- [ ] Step 2 — run RED:
  npm test -- src/components/pages/ServicePageView.test.tsx src/app/[infoSlug]/page.test.tsx

- [ ] Step 3 — implement:
  export function ServicePageView({ page, faq, settings }: Props) {
    return <main className={"service-page service-page--" + page.slug}>…</main>;
  }
  Build delivery stages and contacts from current sections/settings only. For about, missing page/company media becomes a semantic fact panel, never an illustration. Reuse LeadForm; do not create an endpoint or a second form.

- [ ] Step 4 — run the same command and confirm PASS.

- [ ] Step 5 — commit only the files listed above:
  git commit -m "fix(frontend): compose factual service pages"

### Task 5: One responsive visual system and browser gate

**Files:**
- Modify: frontend/src/app/globals.css
- Modify: frontend/src/components/sections/HomeHero.styles.test.ts
- Modify: frontend/src/components/sections/HomeCategories.styles.test.ts
- Modify: frontend/src/components/catalog/CatalogControls.styles.test.ts
- Create: frontend/src/components/pages/ServicePageView.styles.test.ts

**Interfaces:** Consumes CSS hooks from Tasks 1–4 and produces one final layer for declared routes and widths.

- [ ] Step 1 — write failing source-style tests:
  expect(css).toMatch(/\\.mobile-contact-bar[\\s\\S]*env\\(safe-area-inset-bottom\\)/);
  expect(css).toMatch(/@media \\(max-width: 48rem\\)[\\s\\S]*\\.commerce-hero__mobile-media/);
  expect(css).not.toMatch(/\\.product-card__title[\\s\\S]*-webkit-line-clamp/);

- [ ] Step 2 — run RED:
  npm test -- src/components/sections/HomeHero.styles.test.ts src/components/sections/HomeCategories.styles.test.ts src/components/catalog/CatalogControls.styles.test.ts src/components/pages/ServicePageView.styles.test.ts

- [ ] Step 3 — replace superseded duplicate declarations only for plan-owned selectors with a final layer. Use content-led heights, 16px mobile body text, 44px targets, breakpoint-specific grids, and container-gutter compensation rather than 100vw. Reserve:
  body:has(.mobile-contact-bar) main { padding-bottom: calc(4.5rem + env(safe-area-inset-bottom)); }

- [ ] Step 4 — run:
  npm test -- src/components/sections/HomeHero.styles.test.ts src/components/sections/HomeCategories.styles.test.ts src/components/catalog/CatalogControls.styles.test.ts src/components/pages/ServicePageView.styles.test.ts
  npm run typecheck
  npm run lint
  npm test
  npm run build
  Expected: every command exits 0.

- [ ] Step 5 — browser visual QA without submission. Check /, /catalog, a category/product, /delivery, /contacts, /about at 390, 768, 1024, 1280, and 1440. Record: root overflow; clipped title/action; mobile-bar overlap; one H1; layout at each breakpoint; console errors. A failing local Directus fixture is recorded as a data-fixture limitation, never fixed by changing Directus or endpoints.

- [ ] Step 6 — commit only CSS and listed style tests:
  git commit -m "fix(frontend): lock responsive reference layout"
