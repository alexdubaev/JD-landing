# Balanced Motion And Stable Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Устранить циклическое переключение хедера и добавить заметную, но сдержанную индустриальную motion-систему на главную и карточки каталога.

**Architecture:** Хедер остаётся отдельным Client Component, но его фиксированное позиционирование отделяется от стабильного spacer в потоке, а чистая функция гистерезиса покрывается unit-тестом. Общие motion-примитивы усиливаются и переиспользуются Server Components; hero и этапы получают узкие клиентские обёртки для scroll-linked эффектов.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Motion 12, CSS, Vitest, Testing Library, Playwright/Chrome.

## Global Constraints

- Контент и Directus-запросы остаются в Server Components.
- Не добавлять неподтверждённые цены, сроки, гарантии или официальный статус John Deere.
- Пространственное движение отключается при `prefers-reduced-motion`.
- Цена, артикул и наличие не получают отдельную анимацию.
- Не допускать горизонтальную прокрутку на ширинах 320–1440 px.

---

### Task 1: Stable fixed header

**Files:**
- Modify: `frontend/src/components/layout/HeaderChrome.tsx`
- Create: `frontend/src/components/layout/header-scroll-state.ts`
- Create: `frontend/src/components/layout/header-scroll-state.test.ts`
- Modify: `frontend/src/app/globals.css`

**Interfaces:**
- Produces: `nextHeaderScrollState(current: boolean, scrollY: number): boolean`
- Consumes: browser `scrollY`

- [ ] **Step 1: Write the failing state-machine test**

```ts
expect(nextHeaderScrollState(false, 97)).toBe(true);
expect(nextHeaderScrollState(true, 48)).toBe(true);
expect(nextHeaderScrollState(true, 15)).toBe(false);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/layout/header-scroll-state.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement hysteresis and stable document geometry**

```ts
export const nextHeaderScrollState = (current: boolean, scrollY: number) =>
  current ? scrollY >= 16 : scrollY > 96;
```

Render `.site-header-spacer` before the fixed header and update scroll state
inside one `requestAnimationFrame` per frame. Give spacer 125 px on desktop
and the existing compact mobile height at mobile breakpoints.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/components/layout/header-scroll-state.test.ts src/components/layout/Header.test.tsx`
Expected: all selected tests PASS.

### Task 2: Stronger shared motion primitives

**Files:**
- Modify: `frontend/src/components/motion/Reveal.tsx`
- Modify: `frontend/src/components/motion/Stagger.tsx`
- Modify: `frontend/src/components/motion/InteractiveCard.tsx`
- Modify: `frontend/src/components/motion/MotionPrimitives.test.tsx`
- Modify: `frontend/src/app/globals.css`

**Interfaces:**
- Produces: `Reveal` with `distance` and `accent` options
- Produces: viewport-driven `Stagger`/`StaggerItem`
- Produces: `InteractiveCard` with keyboard-equivalent CSS states

- [ ] **Step 1: Add failing assertions**

Assert that reveal exposes `data-motion-direction`, stagger uses
`whileInView="visible"` with `viewport.once`, and reduced motion keeps neutral
transforms.

- [ ] **Step 2: Run focused test and observe failure**

Run: `npm test -- src/components/motion/MotionPrimitives.test.tsx`
Expected: FAIL on the new motion contract.

- [ ] **Step 3: Implement primitives**

Use variants with a 40–48 px offset, `filter: blur(6px)` to `blur(0)`,
`staggerChildren: 0.09`, spring-like card hover, and CSS accent sweeps.
Keep content rendered and visible in the server response.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/components/motion/MotionPrimitives.test.tsx`
Expected: PASS.

### Task 3: Hero and section choreography

**Files:**
- Create: `frontend/src/components/motion/HeroMotion.tsx`
- Create: `frontend/src/components/motion/ProcessMotion.tsx`
- Modify: `frontend/src/components/sections/HomeHero.tsx`
- Modify: `frontend/src/components/sections/HomeSelection.tsx`
- Modify: `frontend/src/components/sections/HomeContentSections.tsx`
- Modify: `frontend/src/app/globals.css`
- Create: `frontend/src/components/motion/HeroMotion.test.tsx`

**Interfaces:**
- Produces: `HeroMotion` wrapper using `useScroll`, `useTransform`, `useSpring`
- Produces: `ProcessMotion` animated progress line

- [ ] **Step 1: Add failing accessibility/reduced-motion tests**

Render the wrappers with reduced motion enabled and assert neutral CSS custom
properties and no hidden accessible content.

- [ ] **Step 2: Run focused test and observe failure**

Run: `npm test -- src/components/motion/HeroMotion.test.tsx`
Expected: FAIL because wrappers do not exist.

- [ ] **Step 3: Implement scroll-linked wrappers**

Map hero target scroll progress from `[0, 1]` to image `y: [0, 70]`,
`scale: [1.04, 1.12]` and glow `y: [0, -45]`; return neutral motion values
when reduced motion is requested. Animate process line `scaleX` when the
section enters the viewport.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/components/motion/HeroMotion.test.tsx`
Expected: PASS.

### Task 4: Card, CTA and responsive polish

**Files:**
- Modify: `frontend/src/components/catalog/ProductCard.tsx`
- Modify: `frontend/src/components/sections/HomeCategories.tsx`
- Modify: `frontend/src/components/sections/HomeContentSections.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/components/catalog/ProductCard.test.tsx`

**Interfaces:**
- Consumes: existing `InteractiveCard`
- Produces: CSS hooks for image zoom, accent sweep, CTA arrow motion

- [ ] **Step 1: Add failing semantic hook assertions**

Assert product action includes an arrow icon and card media/content classes
required by hover/focus-within transitions.

- [ ] **Step 2: Run focused tests and observe failure**

Run: `npm test -- src/components/catalog/ProductCard.test.tsx`
Expected: FAIL on the new interaction hook.

- [ ] **Step 3: Implement interaction polish**

Add arrow icons without changing CTA copy. Add transform-only image zoom,
highlight sweep, focus-within border, CTA background movement, and mobile
overrides that avoid clipping.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/components/catalog/ProductCard.test.tsx`
Expected: PASS.

### Task 5: Verification

**Files:**
- Verify: all modified frontend files

**Interfaces:**
- Consumes: Tasks 1–4
- Produces: fresh test/build/browser evidence

- [ ] **Step 1: Run complete static verification**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all commands exit 0.

- [ ] **Step 2: Reproduce the original header scenario**

In Chrome, wheel from 180 px to the top while tracing `scrollY`, header height,
and `data-scrolled`. Expected: at most one compact-to-expanded transition and
no document scroll jumps caused by header height.

- [ ] **Step 3: Test responsive layouts**

Check 320, 390, 768, 1024 and 1440 px. Expected: `scrollWidth === innerWidth`,
no clipped hero text and all focus targets visible.

- [ ] **Step 4: Test reduced motion**

Emulate `prefers-reduced-motion: reduce`. Expected: neutral parallax and no
spatial entrance animation while content remains available.

