# Compact Product Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the visual scale of the product-detail header, especially the product image and title.

**Architecture:** Change the product-detail CSS overrides that already own desktop and responsive presentation. No React interfaces or Directus requests change.

**Tech Stack:** Next.js, React, CSS, Vitest.

## Global Constraints

- Keep product content, navigation, image behavior, and interactions unchanged.
- Product images must remain fully visible with `object-fit: contain`.
- Do not add visual frames, backgrounds, shadows, or internal padding around the main product image.

---

### Task 1: Compact product-detail styles

**Files:**
- Modify: `frontend/src/app/globals.css:4203-4285`
- Test: `frontend/src/components/catalog/ProductDetail.test.tsx`

**Interfaces:**
- Consumes: Existing `.product-detail`, `.product-gallery__main`, and `.product-detail h1` selectors.
- Produces: A smaller visual product-detail header without component API changes.

- [ ] **Step 1: Write the failing test**

Add an assertion that the product-detail CSS source has a compact H1 cap, a transparent borderless main gallery, and an image padding value of `0`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/catalog/ProductDetail.test.tsx`
Expected: FAIL because the H1 cap is currently `4.5rem`, and gallery framing remains present.

- [ ] **Step 3: Write minimal implementation**

Update only the product-detail CSS override: lower gallery dimensions, remove framing, reduce typography and spacing, and retain `object-fit: contain`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/catalog/ProductDetail.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run type and lint validation**

Run: `npm run typecheck && npm run lint`
Expected: both commands exit with code 0.
