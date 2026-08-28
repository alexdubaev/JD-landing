# Mobile Hero Search Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile homepage hero a compact, search-first part lookup tool while retaining three bulk-request actions.

**Architecture:** Keep `HomeHero` as the server-rendered composition boundary and `HeroPartSearch` responsible for its interactive search behavior. Mark the existing duplicate contact group for mobile hiding, then append narrow mobile CSS overrides that supersede earlier fixed-height rules without changing desktop.

**Tech Stack:** Next.js App Router, React 19, TypeScript, CSS, Vitest, Testing Library.

## Global Constraints

- Preserve the deep-green canvas and yellow action accent.
- Keep the three scenario URLs and analytics event names unchanged.
- Keep every control touch-friendly with a 44px minimum target.
- Do not change desktop hero layout or search suggestions.
- On mobile, call and request actions must occur in the fixed mobile contact bar, not hero.
- Do not add imagery, cards, shadows, or decorative rounded containers.

---

### Task 1: Mark the duplicate hero contact group

**Files:**
- Modify: `frontend/src/components/sections/HomeHero.tsx:134-150`
- Modify: `frontend/src/components/sections/HomeHero.test.tsx:7-47`

**Interfaces:**
- Consumes: current `phone` and `messengers` values in `HomeHero`.
- Produces: `.commerce-hero__contacts--desktop-only` on the existing contact group.

- [ ] **Step 1: Write the failing test**

Add a `HomeHero.test.tsx` test that renders `HomeHero` with a phone contact and asserts:

```tsx
expect(container.querySelector(".commerce-hero__contacts")).toHaveClass(
  "commerce-hero__contacts--desktop-only",
);
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- HomeHero.test.tsx`

Expected: failure because the class is not present.

- [ ] **Step 3: Add the composition boundary**

Change the wrapper in `HomeHero.tsx` to:

```tsx
<div className="commerce-hero__contacts commerce-hero__contacts--desktop-only">
```

Do not change links, data selection, or analytics.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `npm test -- HomeHero.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run: `git add -- frontend/src/components/sections/HomeHero.tsx frontend/src/components/sections/HomeHero.test.tsx; git commit -m "test: cover mobile hero contact boundary"`

### Task 2: Add compact mobile hero CSS

**Files:**
- Modify: `frontend/src/app/globals.css:after final homepage hero overrides`
- Test: `frontend/src/components/sections/HeroPartSearch.test.tsx`

**Interfaces:**
- Consumes: `.commerce-hero__contacts--desktop-only`, `.hero-part-search__form`, and `.hero-part-search__scenarios`.
- Produces: content-led mobile hero height and compact search/scenario layout.

- [ ] **Step 1: Run the current scenario regression test**

Run: `npm test -- HeroPartSearch.test.tsx`

Expected: PASS, including the exact existing URLs for list, Excel, and photo request links.

- [ ] **Step 2: Append mobile-only rules**

At the end of `globals.css`, add a `@media (max-width: 48rem)` block with these requirements:

```css
.commerce-hero__content { min-height: 0; padding-block: 1.5rem 1.25rem; }
.commerce-hero__copy { max-width: 100%; }
.commerce-hero__copy h1 { max-width: 15ch; font-size: clamp(2rem, 9.2vw, 2.5rem); line-height: 1; text-wrap: balance; }
.commerce-hero__description { margin-top: .75rem; font-size: 1rem; line-height: 1.4; text-wrap: pretty; }
.commerce-hero__contacts--desktop-only { display: none; }
.hero-part-search { margin-top: 1.25rem; }
.hero-part-search__form { grid-template-columns: auto minmax(0, 1fr) auto; min-height: 3.5rem; }
.hero-part-search__form button { min-height: 3.5rem; padding-inline: 1rem; }
.hero-part-search__scenarios { gap: .35rem; margin-top: .75rem; }
.hero-part-search__scenarios > div { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .4rem; }
.hero-part-search__scenarios a { min-height: 2.75rem; justify-content: center; padding-inline: .25rem; font-size: .68rem; line-height: 1.1; text-align: center; }
```

Append a `@media (max-width: 32rem)` block that sets `.commerce-hero__content { min-height: 0; }`, changes the form to two columns, and makes the submit button span both columns at full width.

- [ ] **Step 3: Run component regression tests**

Run: `npm test -- HomeHero.test.tsx HeroPartSearch.test.tsx`

Expected: PASS; all three scenario links retain their current destination and search behavior remains unchanged.

- [ ] **Step 4: Commit Task 2**

Run: `git add -- frontend/src/app/globals.css; git commit -m "style: compact mobile hero search flow"`

### Task 3: Verify the responsive result

**Files:**
- Modify: no source changes expected.

**Interfaces:**
- Consumes: the completed mobile CSS and existing search form.
- Produces: verified behavior at phone and tablet widths.

- [ ] **Step 1: Start the frontend**

Run: `npm run dev`

Expected: local Next.js server starts without compile errors.

- [ ] **Step 2: Inspect 320px, 390px, and 768px**

At 320px, confirm the search submit control moves below the input without horizontal overflow. At 390px, confirm input and submit are a single compact tool. At 768px, confirm the hero does not duplicate call/request actions and ends after the three scenario links.

- [ ] **Step 3: Run quality checks**

Run: `npm run typecheck; npm run lint; npm test -- HomeHero.test.tsx HeroPartSearch.test.tsx`

Expected: all commands return exit code 0.

- [ ] **Step 4: Commit only if inspection requires a correction**

If a CSS correction is needed, run: `git add -- frontend/src/app/globals.css; git commit -m "fix: refine compact mobile hero layout"`. Do not create an empty commit.
