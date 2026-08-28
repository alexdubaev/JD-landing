# Technical SEO Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved technical parity package for DEERE-SHOP: clean service-route indexing, page-specific social metadata, richer article schema, visible category hierarchy, CMS category SEO copy, consent-gated analytics discovery, and lower global client JavaScript overhead.

**Architecture:** Keep Next.js App Router and Directus as the source of truth. Add small pure helpers for social metadata and category-tree construction, keep category SEO text rendering server-side and plain-text safe, and replace the global Motion route-transition client boundary with a server wrapper plus CSS animation. No Directus schema or product data changes are needed.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Directus REST, Vitest, Testing Library, CSS, `next/image`.

**Spec:** `docs/superpowers/specs/2026-08-23-technical-seo-parity-design.md`

## Global Constraints

- Preserve all existing product, category, article and request URLs.
- Do not change Directus schema, roles, permissions, secrets, products, prices, categories, lead processing, dependencies, Docker, Caddy, VPS or deployment files.
- Do not invent a Yandex Metrica counter ID, author name, reviewer name, product data or SEO facts.
- Server-render critical SEO metadata, JSON-LD and category text in the initial HTML.
- `noindex, follow` is the primary signal for `/cart`; do not rely on a robots `Disallow` rule to hide it.
- Do not load Yandex Metrica, GTM or analytics events before explicit analytics consent.
- Keep all image rendering on `next/image` and do not add a bundle-analyzer dependency.
- Preserve existing Excel/photo upload, filters, search, analogs, cart and lead flows.
- Before commit, the staged diff must contain only the declared files for the current task; pre-existing `frontend/src/app/globals.css`, sanitizer files, generated files and untracked handoff material are not to be bundled.

---

## File map

Create:

- `frontend/src/lib/seo/social-metadata.ts` — one pure builder for page-specific Open Graph and Twitter metadata.
- `frontend/src/lib/seo/social-metadata.test.ts` — metadata contract tests.
- `frontend/src/lib/catalog/category-tree.ts` — cycle-safe tree and ancestor helpers.
- `frontend/src/lib/catalog/category-tree.test.ts` — tree/ancestor edge-case tests.
- `frontend/src/app/catalog/[categorySlug]/page.test.tsx` — category route integration tests.
- `frontend/src/components/catalog/CategoryTree.tsx` — server-rendered category hierarchy links.
- `frontend/src/components/catalog/CategoryTree.test.tsx` — accessible tree rendering tests.
- `frontend/src/components/motion/RouteTransition.test.tsx` — server wrapper regression test.

Modify:

- `frontend/src/app/cart/page.tsx` — add `noindex, follow` metadata.
- `frontend/src/app/layout.tsx` — expose `/llms.txt` through metadata/head and keep root defaults.
- `frontend/src/app/page.tsx` — page-specific home OG/Twitter metadata and `og:url`.
- `frontend/src/app/articles/page.tsx` — use page-specific social metadata.
- `frontend/src/app/articles/[slug]/page.tsx` — use social helper and emit optional `author`/`reviewedBy` schema nodes.
- `frontend/src/app/catalog/page.tsx` — render root category tree.
- `frontend/src/app/catalog/[categorySlug]/page.tsx` — render child categories, ancestor breadcrumbs and CMS SEO text.
- `frontend/src/app/catalog/[categorySlug]/[productSlug]/page.tsx` — use social helper for product metadata.
- `frontend/src/app/[infoSlug]/page.tsx` — use the same social metadata contract for CMS information pages where applicable.
- `frontend/src/app/layout.test.tsx` — root metadata/head contract tests.
- `frontend/src/lib/seo/catalog-metadata.ts` — always emit page-specific Open Graph/Twitter values, including no-image pages.
- `frontend/src/lib/seo/schema.ts` — add optional Article author/reviewedBy builders if the existing schema helpers are the right shared boundary.
- `frontend/src/types/catalog.ts` — expose the existing Directus category sort field in the frontend read model.
- `frontend/src/components/catalog/CategorySeoContent.tsx` — render Directus plain-text SEO content once, with fallback copy only when CMS text is empty.
- `frontend/src/components/catalog/CategorySeoContent.test.tsx` — cover CMS-over-fallback behavior.
- `frontend/src/components/layout/Analytics.tsx` — use shared consent behavior and keep optional scripts post-consent only.
- `frontend/src/components/layout/Analytics.test.tsx` — persistence, no-ID and event-loading tests.
- `frontend/src/lib/analytics.ts` — prevent tracked events when consent is not accepted.
- `frontend/src/lib/analytics.test.ts` — consent-aware event tests.
- `frontend/src/components/motion/RouteTransition.tsx` — remove the global Motion/usePathname client boundary while preserving the wrapper and accent behavior.
- `frontend/src/app/globals.css` — category tree styles and CSS-only route accent animation; preserve existing unrelated styles.
- `frontend/src/app/sitemap.test.ts` — assert `/cart` is not emitted.
- `frontend/src/app/layout.test.tsx` or the existing layout metadata test location — assert the llms alternate and root social metadata contract, using the project’s current test pattern.
- `frontend/src/app/page.test.tsx` — keep homepage category fixtures typed with the mapped sort field.
- `frontend/src/components/catalog/CatalogControls.test.tsx` — keep catalog control fixtures typed with the mapped sort field.
- `frontend/src/components/sections/HomeCategories.test.tsx` — keep homepage category fixtures typed with the mapped sort field.
- `frontend/src/app/articles/[slug]/page.test.tsx` — social metadata and Article JSON-LD regression coverage.
- `frontend/src/app/catalog/[categorySlug]/[productSlug]/page.test.tsx` — product social metadata regression coverage.
- `frontend/src/lib/seo/catalog-metadata.test.ts` — no-image OG/Twitter contract coverage.
- `frontend/src/lib/directus/catalog.test.ts` — category sort-order mapping coverage.
- `frontend/src/lib/directus/content.test.ts` — CMS analytics field mapping coverage.
- `frontend/src/components/catalog/ProductCard.test.tsx` — opt-in analytics event fixture.
- `frontend/src/components/forms/LeadForm.test.tsx` — opt-in analytics event fixture.
- `frontend/src/components/sections/HomeCompanyTrust.test.tsx` — opt-in analytics event fixture.
- `frontend/src/components/sections/HomeContactActions.test.tsx` — opt-in analytics event fixtures.

Protected/unmodified:

- `directus/`, `deploy/`, Docker/Caddy files, `.env*`, product/category records, lead/API routes, dependencies and previous sanitizer changes.

---

### Task 1: Add and test the shared social metadata builder

**Files:**

- Create: `frontend/src/lib/seo/social-metadata.ts`
- Test: `frontend/src/lib/seo/social-metadata.test.ts`

**Interfaces:**

```ts
export type SocialMetadataInput = {
  title: string;
  description: string;
  url: string;
  type: "website" | "article";
  image?: string | null;
  imageAlt?: string | null;
  publishedTime?: string;
  modifiedTime?: string;
};

export function buildSocialMetadata(
  input: SocialMetadataInput,
): Pick<Metadata, "openGraph" | "twitter">;
```

- [ ] **Step 1: Write failing tests** for website metadata with an image, article metadata with dates, and missing image.

```ts
it("uses the same page-specific title, description, URL and image for OG and Twitter", () => {
  const meta = buildSocialMetadata({
    title: "Товар L207058",
    description: "Описание товара",
    url: "https://deere-shop.ru/catalog/category/l207058",
    type: "website",
    image: "https://cms.deere-shop.ru/assets/file?width=1200",
    imageAlt: "Патрубок L207058",
  });

  expect(meta.openGraph).toMatchObject({
    title: "Товар L207058",
    description: "Описание товара",
    url: "https://deere-shop.ru/catalog/category/l207058",
    type: "website",
  });
  expect(meta.twitter).toMatchObject({
    card: "summary_large_image",
    title: "Товар L207058",
    description: "Описание товара",
  });
});

it("omits image fields instead of emitting empty values", () => {
  const meta = buildSocialMetadata({
    title: "Каталог",
    description: "Описание",
    url: "https://deere-shop.ru/catalog",
    type: "website",
  });

  expect(meta.openGraph).not.toHaveProperty("images");
  expect(meta.twitter).not.toHaveProperty("images");
});
```

- [ ] **Step 2: Run the focused test**.

Run: `npm test -- --run src/lib/seo/social-metadata.test.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the pure builder**. Use absolute input URLs, preserve `type`, emit `publishedTime`/`modifiedTime` only when supplied, and use the same `title`, `description`, `url` and image for both OG/Twitter. Do not emit empty image arrays.

- [ ] **Step 4: Run the focused test**.

Run: `npm test -- --run src/lib/seo/social-metadata.test.ts`

Expected: PASS.

---

### Task 2: Apply metadata consistently and close cart indexing

**Files:**

- Modify: `frontend/src/app/cart/page.tsx`
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/articles/page.tsx`
- Modify: `frontend/src/app/articles/[slug]/page.tsx`
- Modify: `frontend/src/app/catalog/[categorySlug]/[productSlug]/page.tsx`
- Modify: `frontend/src/app/[infoSlug]/page.tsx`
- Modify: `frontend/src/lib/seo/catalog-metadata.ts`
- Test: existing metadata tests plus the route tests for the affected pages

**Interfaces:**

- All page `generateMetadata` functions call `buildSocialMetadata` with their own resolved title/description/canonical/image.
- `buildCatalogMetadata` returns `openGraph` and `twitter` even when no image exists.
- `CartPage` keeps `200` behavior and exports:

```ts
export const metadata: Metadata = {
  title: "Корзина",
  description: "Выбранные товары и оформление заказа.",
  alternates: { canonical: "/cart" },
  robots: { index: false, follow: true },
};
```

- [ ] **Step 1: Add failing assertions** to the cart/metadata tests for `robots.index === false`, page-specific Twitter title/description, and home `og:url`.

- [ ] **Step 2: Run the focused route tests**.

Run: `npm test -- --run src/lib/seo/catalog-metadata.test.ts src/app/articles/[slug]/page.test.tsx src/app/catalog/[categorySlug]/[productSlug]/page.test.tsx`

Expected: FAIL on the new assertions.

- [ ] **Step 3: Wire the helper into each metadata function**. Keep the existing title template, canonical rules, noindex query rules, OG `article` type for articles and `website` type for catalog/product pages. The root metadata must supply `og:url` for `/`; the default OG image is included only when Directus provides `defaultOgImageId`.

- [ ] **Step 4: Add the `llms.txt` alternate declaration through the supported Next metadata/head mechanism**. The output must be:

```html
<link rel="alternate" type="text/plain" href="/llms.txt" title="Описание сайта для ИИ" />
```

 - [ ] **Step 5: Run route metadata tests and typecheck**.

Run: `npm test -- --run src/lib/seo/catalog-metadata.test.ts src/app/articles/[slug]/page.test.tsx src/app/catalog/[categorySlug]/[productSlug]/page.test.tsx && npm run typecheck`

Expected: PASS.

---

### Task 3: Complete Article JSON-LD with optional author and reviewer

**Files:**

- Modify: `frontend/src/app/articles/[slug]/page.tsx`
- Modify: `frontend/src/lib/seo/schema.ts` only if shared schema helpers are used
- Test: `frontend/src/app/articles/[slug]/page.test.tsx`

**Interfaces:**

- `article.author` maps to `{ "@type": "Person", "name": article.author }` when non-empty.
- `article.reviewer` maps to `reviewedBy: { "@type": "Person", "name": article.reviewer }` when non-empty.
- Empty strings, null and undefined are omitted.

- [ ] **Step 1: Add failing schema assertions** for an article with author/reviewer and one without them.

```ts
expect(articleSchema).toMatchObject({
  author: { "@type": "Person", name: "Редакция DEERE-SHOP" },
  reviewedBy: { "@type": "Person", name: "Технический специалист" },
});
expect(articleSchema).not.toHaveProperty("author", { name: "" });
```

- [ ] **Step 2: Run the article page test** and confirm the new assertions fail.

Run: `npm test -- --run src/app/articles/[slug]/page.test.tsx`

- [ ] **Step 3: Add the conditional fields** to the server-rendered JSON-LD without inventing names or changing existing publisher/date/image fields.

- [ ] **Step 4: Run the article tests and schema tests**.

Run: `npm test -- --run src/app/articles/[slug]/page.test.tsx src/lib/seo/schema.test.ts`

Expected: PASS.

---

### Task 4: Build and render the category hierarchy

**Files:**

- Create: `frontend/src/lib/catalog/category-tree.ts`
- Test: `frontend/src/lib/catalog/category-tree.test.ts`
- Modify: `frontend/src/types/catalog.ts`
- Modify: `frontend/src/lib/directus/catalog.ts`
- Test: `frontend/src/lib/directus/catalog.test.ts`
- Create: `frontend/src/components/catalog/CategoryTree.tsx`
- Test: `frontend/src/components/catalog/CategoryTree.test.tsx`
- Modify: `frontend/src/app/catalog/page.tsx`
- Modify: `frontend/src/app/catalog/[categorySlug]/page.tsx`
- Modify: `frontend/src/app/globals.css`

**Interfaces:**

```ts
export type CategoryTreeNode = Category & {
  children: CategoryTreeNode[];
};

export function buildCategoryTree(
  categories: readonly Category[],
): CategoryTreeNode[];

export function getCategoryAncestors(
  categories: readonly Category[],
  categoryId: string,
): Category[];
```

- `buildCategoryTree` includes only `isIndexable` categories for navigational links, preserves `sort_order` as supplied by the Directus list, and handles missing parents/cycles without recursion failure.
- `getCategoryAncestors` returns the ordered parent chain with a visited set; it never loops on malformed data.

- [ ] **Step 1: Write failing pure-helper tests** for roots/children, missing parent, cycle, and noindex filtering.

```ts
it("does not recurse forever on a parent cycle", () => {
  const tree = buildCategoryTree([
    category("a", "A", "b", true),
    category("b", "B", "a", true),
  ]);

  expect(tree.flatMap((node) => [node.id, ...node.children.map((child) => child.id)])).toEqual(
    expect.arrayContaining(["a", "b"]),
  );
});
```

- [ ] **Step 2: Run the helper test**.

Run: `npm test -- --run src/lib/catalog/category-tree.test.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Add `sortOrder: number` to the frontend `Category` type and mapper, include `sort_order` in `categoryFields`, and add a mapper assertion in `frontend/src/lib/directus/catalog.test.ts`. Default a null Directus value to `0` so sorting remains deterministic.

- [ ] **Step 4: Implement the bounded tree and ancestor helpers** with a `Map` lookup, visited IDs, and deterministic root fallback for missing parents. Sort roots and children by `sortOrder` and then `title`.

- [ ] **Step 5: Implement `CategoryTree` as a server component**. Render nested lists with accessible headings/links; do not link noindex categories and do not invent product/category routes.

- [ ] **Step 6: Add component tests** for accessible links and nested children; run both helper and component tests.

Run: `npm test -- --run src/lib/catalog/category-tree.test.ts src/components/catalog/CategoryTree.test.tsx`

Expected: PASS.

- [ ] **Step 7: Integrate on `/catalog` and category pages**. On `/catalog`, use the already fetched category list. On a category page, fetch the same list in the existing `Promise.all`, render children before products, and build breadcrumbs from `getCategoryAncestors` plus the current category.

- [ ] **Step 8: Add only scoped tree CSS** for indentation, wrapping and mobile layout; do not alter product-card or existing article-link styles.

- [ ] **Step 9: Run category route, mapper and catalog tests plus typecheck**.

Run: `npm test -- --run src/app/catalog/[categorySlug]/page.test.tsx src/app/sitemap.test.ts src/components/catalog/CatalogControls.test.tsx src/lib/directus/catalog.test.ts && npm run typecheck`

Expected: PASS.

---

### Task 5: Render Directus category SEO text safely

**Files:**

- Modify: `frontend/src/components/catalog/CategorySeoContent.tsx`
- Modify: `frontend/src/components/catalog/CategorySeoContent.test.tsx`
- Modify: `frontend/src/app/catalog/[categorySlug]/page.tsx`

**Interfaces:**

```ts
type CategorySeoContentProps = {
  seoText?: string | null;
  content?: Pick<CategorySeoCopy, "intro" | "selectionPoints" | "links"> | null;
};
```

- When `seoText.trim()` is non-empty, render it as escaped text paragraphs under one H2.
- When `seoText` is empty, render the current fallback object if present.
- When both are empty, render nothing.

- [ ] **Step 1: Add failing tests** proving CMS text wins, paragraph breaks are preserved as separate paragraphs, raw tags are rendered as text rather than executable HTML, and fallback remains available.

```ts
it("renders CMS SEO text once and does not execute HTML", () => {
  render(<CategorySeoContent seoText={"Первый абзац\n\n<b>Второй</b>"} />);

  expect(screen.getByText("Первый абзац")).toBeInTheDocument();
  expect(screen.getByText("<b>Второй</b>")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /как подобрать/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused component test** and confirm the new test fails.

Run: `npm test -- --run src/components/catalog/CategorySeoContent.test.tsx`

- [ ] **Step 3: Implement the plain-text renderer** using React text nodes and paragraph splitting on blank lines; never use `dangerouslySetInnerHTML`.

- [ ] **Step 4: Change the category route** to always call the component with `seoText={category.seoText}` and the fallback copy. The component chooses exactly one source.

- [ ] **Step 5: Run the component and category route tests**.

Run: `npm test -- --run src/components/catalog/CategorySeoContent.test.tsx src/app/catalog/[categorySlug]/page.test.tsx`

Expected: PASS.

---

### Task 6: Enforce consent-aware analytics and expose llms discovery

**Files:**

- Modify: `frontend/src/lib/analytics.ts`
- Modify: `frontend/src/lib/analytics.test.ts`
- Modify: `frontend/src/components/layout/Analytics.tsx`
- Modify: `frontend/src/components/layout/Analytics.test.tsx`
- Modify: `frontend/src/app/layout.tsx`

**Interfaces:**

```ts
export function hasAnalyticsConsent(): boolean;
export function trackEvent(
  event: AnalyticsEventName,
  properties?: Omit<AnalyticsEvent, "event">,
): void;
```

- `hasAnalyticsConsent()` returns true only when browser localStorage contains `deere-shop:cookie-consent=accepted`.
- `trackEvent` returns without touching `window.dataLayer` when consent is not accepted.
- `Analytics` keeps existing UI and script IDs, loads GTM/Metrica only after accepted consent, and remains a no-op when IDs are absent.

- [ ] **Step 1: Add failing unit tests** for trackEvent before consent, after accepted consent, and after declined consent.

```ts
it("does not push events before analytics consent", () => {
  window.dataLayer = [];
  trackEvent("search_submit", { query: "L207058" });
  expect(window.dataLayer).toEqual([]);
});
```

- [ ] **Step 2: Run analytics tests** and confirm the new tests fail.

Run: `npm test -- --run src/lib/analytics.test.ts src/components/layout/Analytics.test.tsx`

- [ ] **Step 3: Implement the shared consent reader** using the existing storage key and make `trackEvent` gate on it. Keep server execution safe.

- [ ] **Step 4: Add component tests** for stored accepted consent, stored declined consent and a missing Metrica ID; retain current accept/decline coverage.

- [ ] **Step 5: Run analytics tests and typecheck**.

Run: `npm test -- --run src/lib/analytics.test.ts src/components/layout/Analytics.test.tsx && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Confirm the root metadata/head test covers the text/plain `/llms.txt` alternate link**. The implementation is owned by Task 2 so the head declaration has one source of truth.

---

### Task 7: Remove the global Motion route-transition client boundary

**Files:**

- Modify: `frontend/src/components/motion/RouteTransition.tsx`
- Create: `frontend/src/components/motion/RouteTransition.test.tsx`
- Modify: `frontend/src/app/globals.css`

**Interfaces:**

- `RouteTransition({ children }: { children: ReactNode }): ReactNode` remains the same public component API.
- The component becomes a server-compatible static wrapper with the existing `route-transition` and `route-transition__accent` classes.

- [ ] **Step 1: Add a rendering test** that confirms the wrapper and child content remain in the DOM without requiring browser pathname or Motion runtime.

- [ ] **Step 2: Run the focused test** and confirm it fails if the current client-only implementation cannot be rendered in the intended server-compatible test.

Run: `npm test -- --run src/components/motion/RouteTransition.test.tsx`

- [ ] **Step 3: Replace Motion/usePathname with a static server wrapper** and add a CSS-only accent animation. Add `prefers-reduced-motion: reduce` behavior so the accent is visible without animation and no client script is needed for this visual.

- [ ] **Step 4: Run the route-transition test and typecheck**.

Run: `npm test -- --run src/components/motion/RouteTransition.test.tsx && npm run typecheck`

- [ ] **Step 5: Build and inspect the emitted HTML/script baseline**. Confirm the public page still contains the wrapper, and the global route-transition component no longer imports `motion/react` or `next/navigation`.

Run: `npm run build`

---

### Task 8: Full regression, public-route audit and handoff

**Files:**

- No new source files; inspect only the declared task files.

- [ ] **Step 1: Run the full frontend test suite**.

Run: `npm test -- --run`

Expected: PASS with zero failed tests.

- [ ] **Step 2: Run typecheck, lint and production build**.

Run: `npm run typecheck; npm run lint; npm run build`

Expected: all commands exit 0. If lint reports a pre-existing issue in an undeclared file, stop and report it instead of fixing unrelated code.

- [ ] **Step 3: Compare staged diff scope**.

Run: `git diff --cached --name-only`

Expected: only files listed in the current task’s commit. Do not stage `frontend/next-env.d.ts`, the previous sanitizer changes, `globals.css` hunks unrelated to category/performance work, untracked Directus assets, or handoff files.

- [ ] **Step 4: Start the frontend with the configured environment** and verify raw HTML for:

```text
GET /                      -> 200, page-specific OG/Twitter, og:url
GET /catalog               -> 200, category tree and CollectionPage JSON-LD
GET /catalog/<category>    -> 200, child categories/ancestors and CMS SEO copy
GET /catalog/<category>/<product> -> 200, Product JSON-LD and page-specific Twitter
GET /articles              -> 200, article-list metadata
GET /articles/<slug>       -> 200, Article JSON-LD with optional author/reviewedBy
GET /cart                  -> 200, robots noindex/follow, not in sitemap
GET /robots.txt            -> 200, sitemap reference
GET /sitemap.xml           -> 200, no /cart
GET /llms.txt              -> 200, text/plain
```

- [ ] **Step 5: Run the consent smoke test** in a clean browser storage: cookie panel visible; no `mc.yandex.ru` or GTM request before choice; accept loads only configured analytics; decline keeps analytics absent.

- [ ] **Step 6: Record the final performance comparison** using `curl --compressed` for `/`, `/catalog` and one article: status, TTFB, total time, compressed bytes, script count. Report PageSpeed/CrUX as unavailable if the API remains rate-limited; do not fabricate CWV.

- [ ] **Step 7: Commit the reviewed implementation as one release commit** after the full diff and public route checks pass. Do not deploy or push until the owner explicitly requests that release.
