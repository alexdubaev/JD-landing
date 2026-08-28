# Parts Request First-Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the parts-request heading, breadcrumbs and form into one compact green first-screen layout.

**Architecture:** Keep `PartsRequestPage` responsible for route-level SEO, JSON-LD and page header data. Give `HomePartsRequest` an optional compact variant that renders only description plus the two-column request workbench, while CSS controls the visual composition and mobile stack. No request submission code or Directus shape changes are required.

**Tech Stack:** Next.js App Router, TypeScript, React, CSS, Vitest, Testing Library.

## Global Constraints

- Keep title, description and outcomes sourced from Directus content already loaded by the route.
- Preserve list parsing, uploads, Turnstile, UTM capture, analytics, lead submission, metadata and breadcrumb JSON-LD.
- Keep exactly one H1 and accessible form labels.
- Keep the existing green DEERE-SHOP visual language and mobile-first responsive behavior.

---

### Task 1: Prove the integrated route structure

**Files:**

- Modify: `frontend/src/app/parts-request/page.test.tsx`
- Modify: `frontend/src/app/parts-request/page.tsx:39-61`

**Interfaces:**

- Consumes: `ContentPage`, `getPageBySlug`, `Breadcrumbs`, `HomePartsRequest`.
- Produces: Route markup with breadcrumbs and one CMS H1 inside `.parts-request-page__surface`, and `HomePartsRequest` rendered in compact mode.

- [ ] **Step 1: Write the failing test**

Add a test asserting that the route has `.parts-request-page__surface`, that it contains the `Главная` breadcrumb and the CMS H1, and that `.parts-request-page__heading` is absent:

```tsx
expect(container.querySelector('.parts-request-page__surface')).toContainElement(
  screen.getByRole('heading', { level: 1, name: page.h1 }),
);
expect(container.querySelector('.parts-request-page__heading')).toBeNull();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/parts-request/page.test.tsx`

Expected: FAIL because `.parts-request-page__surface` does not exist.

- [ ] **Step 3: Write minimal implementation**

Replace the heading wrapper in `PartsRequestPage` with a green surface containing `Container`, breadcrumbs, H1 and optional CMS description; render `<HomePartsRequest compact initialMode={mode} section={section} />` below them.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/parts-request/page.test.tsx`

Expected: PASS.

### Task 2: Prove compact request workbench behavior

**Files:**

- Modify: `frontend/src/components/sections/HomePartsRequest.tsx:10-45`
- Create: `frontend/src/components/sections/HomePartsRequest.test.tsx`

**Interfaces:**

- Consumes: `PageSection`, `BulkPartsRequest`, optional `compact?: boolean`.
- Produces: `HomePartsRequest` that suppresses its own duplicate heading when `compact` is true and keeps the outcomes list.

- [ ] **Step 1: Write the failing test**

Render the section with `compact` and assert its CMS description and outcome text are visible while its own `h2` is not:

```tsx
render(<HomePartsRequest compact section={section} />);
expect(screen.queryByRole('heading', { level: 2, name: section.title })).not.toBeInTheDocument();
expect(screen.getByText(section.text!)).toBeInTheDocument();
expect(screen.getByText('Цену по каждой позиции')).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/sections/HomePartsRequest.test.tsx`

Expected: FAIL because `compact` is not a component prop and the H2 still renders.

- [ ] **Step 3: Write minimal implementation**

Add the `compact?: boolean` prop. In compact mode, omit `Reveal` heading markup and render `section.text` as `.home-parts-request__intro` above the existing grid. Preserve non-compact rendering for the homepage.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/sections/HomePartsRequest.test.tsx`

Expected: PASS.

### Task 3: Style and verify the first-screen layout

**Files:**

- Modify: `frontend/src/app/globals.css:5739-6009,6134-6150`
- Modify: `frontend/src/app/parts-request/page.test.tsx`

**Interfaces:**

- Consumes: `.parts-request-page__surface`, `.home-parts-request--compact`, `.home-parts-request__intro`.
- Produces: compact green desktop surface with a two-column workbench and a single-column small-screen layout.

- [ ] **Step 1: Write the failing test**

Extend the route test to verify the compact modifier reaches the rendered workbench:

```tsx
expect(container.querySelector('.home-parts-request--compact')).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/parts-request/page.test.tsx`

Expected: FAIL because the compact modifier is not yet rendered.

- [ ] **Step 3: Write minimal implementation**

Add compact-only CSS that removes duplicate top padding, keeps breadcrumbs/H1/intro within the green surface, uses the existing desktop grid, and switches the grid/contact fields/outcomes to one column at the existing mobile breakpoint. Remove obsolete `.parts-request-page__heading` styling.

- [ ] **Step 4: Run focused automated checks**

Run: `npm test -- src/app/parts-request/page.test.tsx src/components/sections/HomePartsRequest.test.tsx src/components/forms/BulkPartsRequest.test.tsx`

Expected: PASS.

- [ ] **Step 5: Run build and visual verification**

Run: `npm run build`, then start the existing frontend dev server and compare `/parts-request` at desktop and mobile widths with the approved reference. Confirm uploads, clear action, consent checkbox and submit remain operable.

Expected: build exits 0; no console errors; form begins in the first desktop viewport; the mobile layout stacks without horizontal overflow.
