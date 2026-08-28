# DEERE-SHOP Rebrand And Asset-Pack Hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Полностью заменить пользовательский бренд на DEERE-SHOP, сделать прозрачный прокручиваемый header и реализовать интерактивный hero по предоставленному asset pack.

**Architecture:** Серверные layout/page компоненты продолжают получать контент из Directus, а новый `HeroPartSearch` становится небольшим Client Component с реальными товарными подсказками. `HeaderChrome` использует `usePathname` только для выбора контрастного варианта: overlay на главной и тёмный прозрачный вариант на внутренних маршрутах; header нигде не фиксируется.

**Tech Stack:** Next.js 16.2, React 19, TypeScript 5.9, Motion 12, Directus, Vitest, Testing Library, Playwright/Chrome.

## Global Constraints

- Использовать название `DEERE-SHOP` и предоставленный логотип.
- Не заявлять официальный статус John Deere.
- Не переносить неподтверждённые обещания о гарантии, количестве товаров, сроках доставки или поддержке 24/7.
- Контент и Directus-запросы оставлять серверными.
- Отключать пространственное движение при `prefers-reduced-motion`.
- Не допускать горизонтальную прокрутку на ширинах 320–1440 px.

---

### Task 1: Brand defaults, metadata and Directus seed

**Files:**
- Create: `frontend/src/lib/brand.ts`
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/components/layout/Header.tsx`
- Modify: `frontend/src/components/layout/Footer.tsx`
- Modify: `frontend/src/components/pages/ContentPageView.tsx`
- Modify: `frontend/src/components/sections/HomeHero.tsx`
- Modify: `frontend/src/lib/directus/content.ts`
- Modify: `frontend/src/lib/directus/content.test.ts`
- Modify: `frontend/src/components/layout/Header.test.tsx`
- Modify: `directus/schema/blueprint.mjs`
- Modify: `directus/schema/blueprint.test.mjs`

**Interfaces:**
- Produces: `BRAND_NAME`, `BRAND_LOGO_PATH`, `BRAND_DESCRIPTION`
- Produces: safe `getSiteSettings()` mapping with DEERE-SHOP fallback

- [ ] **Step 1: Write failing brand assertions**

```ts
expect(screen.getByRole("img", {
  name: "DEERE-SHOP — запчасти для спецтехники",
})).toHaveAttribute("src", expect.stringContaining("deere-shop-logo"));
expect(mapSiteSettings({ company_name: null }).companyName).toBe("DEERE-SHOP");
```

- [ ] **Step 2: Run focused tests**

Run: `npm test -- src/components/layout/Header.test.tsx src/lib/directus/content.test.ts`
Expected: FAIL because current fallbacks still reference СМ ТЕХНО.

- [ ] **Step 3: Implement brand constants and CMS seed**

```ts
export const BRAND_NAME = "DEERE-SHOP";
export const BRAND_LOGO_PATH = "/brand/deere-shop-logo.png";
export const BRAND_DESCRIPTION =
  "Каталог комплектующих John Deere и подбор решений под задачи клиента.";
```

Add a deterministic `site_settings` seed with `id: 1`,
`company_name: "DEERE-SHOP"`, neutral footer copy and asset-pack colors.

- [ ] **Step 4: Run focused tests**

Run frontend: `npm test -- src/components/layout/Header.test.tsx src/lib/directus/content.test.ts`

Run Directus: `node --test schema/blueprint.test.mjs`

Expected: both selected test commands PASS.

### Task 2: Transparent non-sticky header

**Files:**
- Modify: `frontend/src/components/layout/HeaderChrome.tsx`
- Delete: `frontend/src/components/layout/header-scroll-state.ts`
- Delete: `frontend/src/components/layout/header-scroll-state.test.ts`
- Modify: `frontend/src/components/layout/Header.test.tsx`
- Modify: `frontend/src/app/globals.css`

**Interfaces:**
- Produces: header attribute `data-header-variant="overlay" | "content"`
- Consumes: `usePathname()` from `next/navigation`

- [ ] **Step 1: Write failing route-variant tests**

```ts
mockUsePathname.mockReturnValue("/");
expect(screen.getByRole("banner")).toHaveAttribute(
  "data-header-variant",
  "overlay",
);
expect(screen.getByRole("banner")).not.toHaveClass("is-sticky");
```

- [ ] **Step 2: Run test and verify failure**

Run: `npm test -- src/components/layout/Header.test.tsx`
Expected: FAIL because header has `data-scrolled` and fixed geometry.

- [ ] **Step 3: Implement route-aware transparent header**

```tsx
const pathname = usePathname();
const variant = pathname === "/" ? "overlay" : "content";
return (
  <header className="site-header" data-header-variant={variant}>
    {children}
  </header>
);
```

Remove spacer, fixed/sticky positioning, compaction rules and scroll listener.
Use absolute positioning only for the homepage overlay variant.

- [ ] **Step 4: Run header tests**

Run: `npm test -- src/components/layout/Header.test.tsx`
Expected: PASS.

### Task 3: Accessible catalog-backed hero search

**Files:**
- Create: `frontend/src/components/sections/HeroPartSearch.tsx`
- Create: `frontend/src/components/sections/HeroPartSearch.test.tsx`
- Modify: `frontend/src/components/sections/HomeHero.tsx`

**Interfaces:**
- Consumes: `products: ProductCardData[]`
- Produces: GET navigation to `/catalog?q=<query>`

- [ ] **Step 1: Write failing interaction tests**

```tsx
fireEvent.change(screen.getByRole("searchbox"), { target: { value: "R8" } });
expect(screen.getByRole("listbox")).toBeInTheDocument();
fireEvent.keyDown(screen.getByRole("searchbox"), { key: "ArrowDown" });
fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Enter" });
expect(screen.getByRole("searchbox")).toHaveValue("R85169");
```

Also assert that an empty query keeps the submit button disabled and `Escape`
closes the listbox.

- [ ] **Step 2: Run test and verify failure**

Run: `npm test -- src/components/sections/HeroPartSearch.test.tsx`
Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement search**

Filter at most four products by case-insensitive SKU/title match, render
`role="listbox"`/`role="option"`, track the active option, and submit a GET
form to `/catalog`. Example chips are the first three non-empty real SKUs.

- [ ] **Step 4: Run search tests**

Run: `npm test -- src/components/sections/HeroPartSearch.test.tsx`
Expected: PASS.

### Task 4: Asset-pack hero and embedded benefits

**Files:**
- Copy: `data/deere-shop-codex-hero/deere_shop_hero_assetpack/images/hero.png` to `frontend/public/images/home/deere-shop-hero.png`
- Copy: `data/deere-shop-codex-hero/deere_shop_hero_assetpack/images/logo.png` to `frontend/public/brand/deere-shop-logo.png`
- Modify: `frontend/src/app/HomePageView.tsx`
- Modify: `frontend/src/components/sections/HomeHero.tsx`
- Modify: `frontend/src/components/sections/HomeBenefits.tsx`
- Modify: `frontend/src/components/motion/HeroMotion.tsx`
- Modify: `frontend/src/app/page.test.tsx`
- Modify: `frontend/src/app/globals.css`

**Interfaces:**
- `HomeHero` consumes `benefitsSection: PageSection | null` and
  `products: ProductCardData[]`
- `HomePageView` suppresses the standalone `advantages` section only when its
  items are passed into the rendered hero

- [ ] **Step 1: Write failing page assertions**

```tsx
expect(screen.getByRole("search", { name: "Поиск запчастей" }))
  .toBeInTheDocument();
expect(screen.getByText("Проверка запроса")).toBeInTheDocument();
expect(document.querySelectorAll(".home-benefits")).toHaveLength(0);
```

- [ ] **Step 2: Run test and verify failure**

Run: `npm test -- src/app/page.test.tsx`
Expected: FAIL because benefits render as a separate section.

- [ ] **Step 3: Implement the composition**

Use the asset-pack image, white/green split heading, yellow search button,
real example chips, embedded 4-item benefits row, and neutral copy. Reduce
parallax output from 72 px to a maximum of 12 px.

- [ ] **Step 4: Run page/motion tests**

Run: `npm test -- src/app/page.test.tsx src/components/motion/HeroMotion.test.tsx`
Expected: PASS.

### Task 5: Apply CMS rebrand and verify

**Files:**
- Update: live Directus `site_settings`
- Upload: new logo into the Directus public folder
- Verify: all modified frontend and Directus files

**Interfaces:**
- Consumes: administrator credentials from `directus/.env`
- Produces: live `site_settings.company_name = "DEERE-SHOP"` and `logo`
  relation

- [ ] **Step 1: Upload the logo and upsert settings through Directus**

Authenticate via `/auth/login`, upload the logo to the configured public
folder, then create or update singleton settings with asset-pack colors and
neutral copy. Do not expose the access token in logs.

- [ ] **Step 2: Run full verification**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all commands exit 0.

- [ ] **Step 3: Run browser acceptance**

Check 320, 390, 768, 1024 and 1440 px. Confirm:

- header is transparent and leaves the viewport with the page;
- homepage header overlays hero;
- internal header remains in normal flow;
- search dropdown works with mouse and keyboard;
- no old brand text or horizontal overflow;
- reduced motion neutralizes parallax.

- [ ] **Step 4: Restart the development server**

Start Next.js on `http://localhost:3000` with the existing Directus
environment and confirm HTTP 200 with a clean browser console.
