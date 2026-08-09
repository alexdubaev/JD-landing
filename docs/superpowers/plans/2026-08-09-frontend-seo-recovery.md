# Frontend SEO Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Исправить главные SEO-проблемы каталога на фронтенде, не меняя Directus и не добавляя неподтверждённые сведения о запчастях.

**Architecture:** Фактические данные продолжают поступать из Directus. Фронтенд-модули содержат только безопасные fallback-тексты trust-страниц и категорий; серверные маршруты используют их при пустых CMS-данных. Schema и sitemap используют лишь канонические индексируемые URL.

**Tech Stack:** Next.js App Router 16, React 19, TypeScript 5, Vitest, Testing Library.

## Global Constraints

- Не менять коллекции, поля, роли и записи Directus.
- Не создавать списки применимости, размеры, цены, наличие и технические характеристики, если их нет в исходном товаре.
- Не называть сайт официальным представителем John Deere.
- SEO-элементы должны быть в серверном HTML.
- Каждому production-изменению предшествует тест, запущенный до изменения и упавший по ожидаемой причине.

---

### Task 1: Trust-страницы с frontend fallback

**Files:**
- Create: `frontend/src/lib/seo/trust-pages.ts`
- Create: `frontend/src/lib/seo/trust-pages.test.ts`
- Modify: `frontend/src/app/[infoSlug]/page.tsx`
- Modify: `frontend/src/components/pages/ContentPageView.tsx`

**Interfaces:**
- Produces: `getTrustPageFallback(slug: string): ContentPage | null` and `getTrustPageMetadata(slug: string): { title: string; description: string } | null`.
- Consumes: `ContentPage` and `PageSection` from `@/types/content`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from "vitest";
import { getTrustPageFallback, getTrustPageMetadata } from "./trust-pages";

it("returns delivery fallback with unique metadata", () => {
  expect(getTrustPageFallback("delivery")?.h1).toBe("Доставка запчастей John Deere");
  expect(getTrustPageMetadata("delivery")?.description).toMatch(/Доставка/);
});

it("returns null for an unknown slug", () => {
  expect(getTrustPageFallback("unknown")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/seo/trust-pages.test.ts`

Expected: FAIL because `./trust-pages` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create typed documents for `about`, `delivery`, `contacts`, `privacy-policy`. Each document has one H1, a unique 120–160 character description and factual sections without invented contacts, delivery terms or legal claims. In the info route, use the fallback only after `getPageBySlug` returns `null`; keep `thank-you` as the only noindex route.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/seo/trust-pages.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

    git add frontend/src/lib/seo/trust-pages.ts frontend/src/lib/seo/trust-pages.test.ts frontend/src/app/[infoSlug]/page.tsx frontend/src/components/pages/ContentPageView.tsx
    git commit -m "feat: restore frontend trust page fallbacks"

### Task 2: SEO-блоки категорий

**Files:**
- Create: `frontend/src/lib/seo/category-content.ts`
- Create: `frontend/src/lib/seo/category-content.test.ts`
- Create: `frontend/src/components/catalog/CategorySeoContent.tsx`
- Create: `frontend/src/components/catalog/CategorySeoContent.test.tsx`
- Modify: `frontend/src/app/catalog/[categorySlug]/page.tsx`

**Interfaces:**
- Produces: `getCategorySeoContent(slug: string): CategorySeoContent | null` and server component `CategorySeoContent`.
- Consumes: `Category` from `@/types/catalog`; CMS metadata always has priority over fallback metadata.

- [ ] **Step 1: Write the failing tests**

```ts
import { expect, it } from "vitest";
import { getCategorySeoContent } from "./category-content";

it("provides editorial copy for engine category", () => {
  const content = getCategorySeoContent("dvigatel");
  expect(content?.metaDescription).toMatch(/детал/i);
  expect(content?.selectionPoints).not.toHaveLength(0);
});

it("returns null for an unmapped category", () => {
  expect(getCategorySeoContent("not-a-category")).toBeNull();
});
```

```tsx
render(<CategorySeoContent content={content} />);
expect(screen.getByRole("heading", { level: 2, name: /как подобрать/i })).toBeInTheDocument();
expect(screen.getByRole("link", { name: /каталог/i })).toHaveAttribute("href", "/catalog");
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/seo/category-content.test.ts src/components/catalog/CategorySeoContent.test.tsx`

Expected: FAIL because the module and component do not exist.

- [ ] **Step 3: Write minimal implementation**

Create a readonly map for `dvigatel`, `gidravlika`, `elektrika`, `krepezh`, `podshipniki-i-vtulki`, `nasosy-i-kompressory`, `rezhushchiy-apparat`, `detali-uborochnoy-tehniki`, `naveska-i-tyagi`, `podveska-i-stabilizatory`, `prochie-detali-john-deere`. Each entry includes meta title/description, introduction, 2–3 prompts to provide article number, marking, model or photo, and links only to `/catalog`, `/parts-request`, `/articles`. Route logic prefers CMS `seoTitle`, `seoDescription`, `description`, `intro`, `selectionGuide`, `internalLinks`; fallback fills only missing content. Render the component after the product grid.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/seo/category-content.test.ts src/components/catalog/CategorySeoContent.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

    git add frontend/src/lib/seo/category-content.ts frontend/src/lib/seo/category-content.test.ts frontend/src/components/catalog/CategorySeoContent.tsx frontend/src/components/catalog/CategorySeoContent.test.tsx frontend/src/app/catalog/[categorySlug]/page.tsx
    git commit -m "feat: add category SEO content fallbacks"

### Task 3: Проверенные данные товара

**Files:**
- Create: `frontend/src/components/catalog/ProductVerification.tsx`
- Create: `frontend/src/components/catalog/ProductVerification.test.tsx`
- Modify: `frontend/src/components/catalog/ProductDetail.tsx`

**Interfaces:**
- Produces: `ProductVerification` accepting `Pick<Product, "sku" | "category" | "verifiedAt" | "reviewedBy" | "sourceName" | "sourceUrl">`.
- Consumes: existing Product data returned by Directus only.

- [ ] **Step 1: Write the failing test**

```tsx
render(<ProductVerification product={{ sku: "RE530656", category: null, verifiedAt: "2026-08-01", reviewedBy: "Специалист по подбору", sourceName: null, sourceUrl: null }} />);
expect(screen.getByText(/данные проверены/i)).toBeInTheDocument();
expect(screen.getByText("Специалист по подбору")).toBeInTheDocument();

render(<ProductVerification product={{ sku: "RE530656", category: null, verifiedAt: null, reviewedBy: null, sourceName: null, sourceUrl: null }} />);
expect(screen.queryByText(/данные проверены/i)).not.toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/catalog/ProductVerification.test.tsx`

Expected: FAIL because `ProductVerification` does not exist.

- [ ] **Step 3: Write minimal implementation**

Render an optional “Проверка данных” section only when Directus already provides `verifiedAt`, `reviewedBy`, `sourceName` or a valid HTTPS `sourceUrl`. Format dates in Russian locale. Keep the compatibility warning and ask for the article, marking, model or photo; do not infer applicability.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/catalog/ProductVerification.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

    git add frontend/src/components/catalog/ProductVerification.tsx frontend/src/components/catalog/ProductVerification.test.tsx frontend/src/components/catalog/ProductDetail.tsx
    git commit -m "feat: show verified product context"

### Task 4: Schema и sitemap

**Files:**
- Modify: `frontend/src/lib/seo/schema.ts`
- Modify: `frontend/src/lib/seo/schema.test.ts`
- Create: `frontend/src/app/sitemap.test.ts`
- Modify: `frontend/src/app/sitemap.ts`

**Interfaces:**
- Produces: Product schema with absolute image URL, WebSite schema without SearchAction, and `INDEXABLE_STATIC_PATHS` used by sitemap.
- Consumes: `absoluteUrl`, `directusAssetUrl` and current sitemap getters.

- [ ] **Step 1: Write the failing tests**

```ts
it("uses an absolute URL for product images", () => {
  const schema = buildProductSchema({ product: baseProduct, categorySlug: "filters" });
  expect(schema.image).toMatch(/^https:\/\/deere-shop\.ru\/media\//);
});

it("does not expose obsolete SearchAction markup", () => {
  expect(buildWebSiteSchema(settings).potentialAction).toBeUndefined();
});
```

```ts
it("excludes noindex-only routes from sitemap", async () => {
  const entries = await sitemap();
  expect(entries.map(({ url }) => url)).not.toContain("https://deere-shop.ru/thank-you");
  expect(entries.map(({ url }) => url)).not.toContain("https://deere-shop.ru/parts-request");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/seo/schema.test.ts src/app/sitemap.test.ts`

Expected: FAIL because product images are relative and WebSite schema still has `potentialAction`; sitemap test has not yet been created.

- [ ] **Step 3: Write minimal implementation**

Use `absoluteUrl(directusAssetUrl(...))` only when the asset URL is non-null, remove `potentialAction` from `buildWebSiteSchema`, and export `INDEXABLE_STATIC_PATHS` containing only public canonical static routes. Preserve Directus filters for categories, products and articles; never add `/thank-you` or `/parts-request`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/seo/schema.test.ts src/app/sitemap.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

    git add frontend/src/lib/seo/schema.ts frontend/src/lib/seo/schema.test.ts frontend/src/app/sitemap.ts frontend/src/app/sitemap.test.ts
    git commit -m "fix: harden schema and sitemap SEO signals"

### Task 5: Полная проверка

**Files:**
- Modify: no source files expected.

**Interfaces:**
- Consumes: completed Tasks 1–4.
- Produces: fresh evidence for unit tests, lint, typecheck and production build.

- [ ] **Step 1: Run complete tests**

Run: `npm test`

Expected: exit code 0.

- [ ] **Step 2: Run static checks**

Run: `npm run lint && npm run typecheck`

Expected: exit code 0.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: exit code 0 and generated sitemap route.

- [ ] **Step 4: Verify final diff and commit**

    git diff --check
    git status --short
    git add frontend
    git commit -m "feat: complete frontend SEO recovery"
