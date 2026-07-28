# John Deere Catalog Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production Next.js catalog that renders the 12-collection Directus model, supports product discovery and lead capture, and satisfies the project SEO routes.

**Architecture:** A standalone `frontend/` App Router application uses Server Components and a server-only Directus REST client. Directus records are mapped into stable view types before rendering; catalog state is encoded in URL parameters, while mutations pass through validated route handlers.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Vitest, Testing Library, Zod, Lucide React, Directus REST.

## Global Constraints

- Use Directus `12.1.1` and the exact 12 custom collections in `DIRECTUS_COLLECTIONS_PLAN.md`.
- Never expose `DIRECTUS_TOKEN` or use it in a `NEXT_PUBLIC_*` variable.
- Every public content query must include `status=published`.
- Server Components are the default; only interactive controls are Client Components.
- Use neutral wording and never claim official John Deere representative status.
- Do not invent prices, SKUs, availability, or technical specifications.
- Preserve the restrained green Vibe visual direction and reduced-motion behavior.
- All interactive controls must meet WCAG 2.1 AA keyboard, labeling, focus, and contrast requirements.

---

### Task 1: Application foundation and verification commands

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/next.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/postcss.config.mjs`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/app/layout.tsx`
- Create: `frontend/src/app/page.tsx`
- Create: `frontend/src/app/globals.css`
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/.env.example`
- Create: `frontend/.gitignore`

**Interfaces:**
- Produces: `npm run dev`, `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`.

- [ ] **Step 1: Create the package and test configuration**

Use scripts:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run"
}
```

Configure Vitest for `jsdom`, `@/*` → `src/*`, and `src/test/setup.ts`.

- [ ] **Step 2: Add a smoke test before the page implementation**

Create `frontend/src/app/page.test.tsx` and assert that the page exposes one
`h1` containing “John Deere” and a link to `/catalog`.

- [ ] **Step 3: Run the smoke test and verify it fails**

Run: `npm test -- src/app/page.test.tsx`

Expected: FAIL because the application page is not implemented.

- [ ] **Step 4: Implement the minimal root layout and page**

Use Russian metadata, semantic `main`, a catalog link, system font fallbacks,
and the Vibe-derived design tokens in `globals.css`.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

Commit: `feat(frontend): scaffold Next.js catalog`

### Task 2: Typed server-only Directus boundary

**Files:**
- Create: `frontend/src/types/directus.ts`
- Create: `frontend/src/lib/directus/env.ts`
- Create: `frontend/src/lib/directus/client.ts`
- Create: `frontend/src/lib/directus/client.test.ts`
- Create: `frontend/src/lib/directus/assets.ts`
- Create: `frontend/src/lib/directus/assets.test.ts`

**Interfaces:**
- Produces: `directusRequest<T>(path: string, init?: RequestInit): Promise<T>`,
  `directusAssetUrl(id: string | null, transforms?: Record<string,string|number>): string | null`.

- [ ] **Step 1: Write failing boundary tests**

Mock `global.fetch` and assert:

```ts
await directusRequest("/items/products?filter[status][_eq]=published");
expect(fetch).toHaveBeenCalledWith(
  "https://cms.example.test/items/products?filter[status][_eq]=published",
  expect.objectContaining({
    headers: expect.objectContaining({ Authorization: "Bearer server-token" }),
  }),
);
```

Also assert that a non-2xx response throws `DirectusRequestError` without
including the token and that `directusAssetUrl("file-id", { width: 800 })`
returns an encoded local `/media/file-id` URL. The media route added with the
catalog UI verifies the file's public folder before proxying it.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- src/lib/directus`

Expected: FAIL with unresolved modules.

- [ ] **Step 3: Implement environment and request helpers**

Validate `DIRECTUS_URL`, `DIRECTUS_TOKEN`, and `NEXT_PUBLIC_SITE_URL` with Zod.
Add `import "server-only"` to the environment and client modules. Parse the
Directus `{ data }` envelope and use `next: { tags, revalidate }` only when
provided by the caller.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- src/lib/directus && npm run typecheck`

Commit: `feat(frontend): add server-only Directus client`

### Task 3: Catalog query and mapping layer

**Files:**
- Create: `frontend/src/lib/directus/catalog.ts`
- Create: `frontend/src/lib/directus/catalog.test.ts`
- Create: `frontend/src/lib/catalog/search-params.ts`
- Create: `frontend/src/lib/catalog/search-params.test.ts`
- Create: `frontend/src/types/catalog.ts`

**Interfaces:**
- Produces:
  `getCategories(): Promise<Category[]>`,
  `getCatalogPage(input: CatalogQuery): Promise<CatalogPage>`,
  `getCategoryBySlug(slug: string): Promise<Category | null>`,
  `getProductBySlugs(categorySlug: string, productSlug: string): Promise<Product | null>`,
  `parseCatalogSearchParams(input): CatalogQuery`.

- [ ] **Step 1: Write failing query tests**

Assert every content URL contains `filter[status][_eq]=published`; catalog URLs
must also encode search, category, availability, sort, page, and limit.
Assert `parseCatalogSearchParams` clamps page to at least 1, allows only known
sort values, trims search, and drops unknown filters.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/lib/directus/catalog.test.ts src/lib/catalog/search-params.test.ts`

Expected: FAIL with unresolved modules.

- [ ] **Step 3: Implement typed mapping and query construction**

Select only required fields. Map nullable file relations and JSON gallery data
defensively. Use `meta=filter_count` and return:

```ts
type CatalogPage = {
  items: ProductCardData[];
  total: number;
  page: number;
  pageSize: number;
};
```

- [ ] **Step 4: Verify and commit**

Run: `npm test -- src/lib && npm run typecheck`

Commit: `feat(frontend): add typed catalog queries`

### Task 4: Design system and shared layout

**Files:**
- Create: `frontend/src/components/ui/Button.tsx`
- Create: `frontend/src/components/ui/Container.tsx`
- Create: `frontend/src/components/layout/Header.tsx`
- Create: `frontend/src/components/layout/MobileNavigation.tsx`
- Create: `frontend/src/components/layout/Footer.tsx`
- Create: `frontend/src/components/layout/Breadcrumbs.tsx`
- Create: `frontend/src/components/layout/Header.test.tsx`
- Create: `frontend/public/brand/sm-techno-logo.png`
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/app/globals.css`

**Interfaces:**
- Consumes: site settings and navigation view types.
- Produces: accessible site chrome used by every route.

- [x] **Step 1: Write failing accessibility tests**

Assert the header has a named navigation landmark, a catalog link, a phone link
when configured, and a keyboard-operable mobile menu button with
`aria-expanded`.

- [x] **Step 2: Run and verify failure**

Run: `npm test -- src/components/layout`

- [x] **Step 3: Implement Vibe-derived tokens and layout**

Use semantic tokens for off-white background, charcoal text, deep green
primary, yellow accent, border, muted text, and focus ring. Keep radii between
6–12px, avoid heavy shadows, and include `prefers-reduced-motion`. Render the
provided “СМ ТЕХНО” logo without recoloring or cropping on a dark header/footer
surface where both its white and yellow lettering remain legible.

- [x] **Step 4: Verify and commit**

Run: `npm test -- src/components/layout && npm run typecheck`

Commit: `feat(frontend): add industrial site layout`

### Task 5: Catalog and category routes

**Files:**
- Create: `frontend/src/components/catalog/ProductCard.tsx`
- Create: `frontend/src/components/catalog/ProductCard.test.tsx`
- Create: `frontend/src/components/catalog/ProductGrid.tsx`
- Create: `frontend/src/components/catalog/CatalogControls.tsx`
- Create: `frontend/src/components/catalog/Pagination.tsx`
- Create: `frontend/src/components/catalog/EmptyCatalog.tsx`
- Create: `frontend/src/app/catalog/page.tsx`
- Create: `frontend/src/app/catalog/loading.tsx`
- Create: `frontend/src/app/catalog/[categorySlug]/page.tsx`
- Create: `frontend/src/app/media/[fileId]/route.ts`
- Create: `frontend/src/app/media/[fileId]/route.test.ts`

**Interfaces:**
- Consumes: Task 3 catalog queries.
- Produces: searchable, filterable, paginated catalog pages.

- [x] **Step 1: Write failing product-card edge tests**

Test fixed price, “Цена по запросу”, missing image placeholder, SKU visibility,
and category/product link construction.

- [x] **Step 2: Run and verify failure**

Run: `npm test -- src/components/catalog/ProductCard.test.tsx`

- [x] **Step 3: Implement catalog UI**

Make controls a Client Component that updates URL parameters through
`router.replace`. Product grids, cards, pagination, and empty states remain
server-rendered. Use `next/image` for Directus assets.

- [x] **Step 4: Implement route metadata and not-found behavior**

Catalog metadata comes from `pages`; category metadata comes from the category
record. Call `notFound()` for an unknown category.

- [x] **Step 5: Verify and commit**

Run: `npm test && npm run typecheck && npm run build`

Commit: `feat(frontend): build catalog and category pages`

### Task 6: Product detail route

**Files:**
- Create: `frontend/src/components/catalog/ProductGallery.tsx`
- Create: `frontend/src/components/catalog/ProductDetail.tsx`
- Create: `frontend/src/components/catalog/SpecTable.tsx`
- Create: `frontend/src/components/catalog/RelatedProducts.tsx`
- Create: `frontend/src/app/catalog/[categorySlug]/[productSlug]/page.tsx`
- Create: `frontend/src/app/catalog/[categorySlug]/[productSlug]/page.test.tsx`

**Interfaces:**
- Consumes: `getProductBySlugs`.
- Produces: complete product detail and Product JSON-LD input.

- [ ] **Step 1: Write failing route tests**

Assert one H1, visible SKU, safe missing-gallery fallback, fixed/on-request
price rendering, specification table only when data exists, and no invented
availability copy.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/app/catalog/[categorySlug]/[productSlug]/page.test.tsx`

- [ ] **Step 3: Implement product composition**

Render documents only when file records exist, related products only when
resolved, and a consultation CTA that carries product/category identifiers.

- [ ] **Step 4: Verify and commit**

Run: `npm test && npm run typecheck && npm run build`

Commit: `feat(frontend): add product detail pages`

### Task 7: CMS section renderer and content routes

**Files:**
- Create: `frontend/src/lib/directus/content.ts`
- Create: `frontend/src/components/sections/SectionRenderer.tsx`
- Create: `frontend/src/components/sections/Hero.tsx`
- Create: `frontend/src/components/sections/CategoryGrid.tsx`
- Create: `frontend/src/components/sections/Advantages.tsx`
- Create: `frontend/src/components/sections/Process.tsx`
- Create: `frontend/src/components/sections/CTASection.tsx`
- Create: `frontend/src/components/sections/FAQ.tsx`
- Create: `frontend/src/components/sections/Contacts.tsx`
- Modify: `frontend/src/app/page.tsx`
- Create: `frontend/src/app/[pageSlug]/page.tsx`

**Interfaces:**
- Produces: explicit `section_type` registry and CMS-driven homepage/content pages.

- [ ] **Step 1: Write failing section-registry tests**

Assert known section types render, invisible sections do not render, and an
unknown type returns `null` without throwing.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/components/sections`

- [ ] **Step 3: Implement section queries and components**

Query page and sections with published filters and sort order. Keep component
props narrow; parse JSON `items` with Zod schemas per section.

- [ ] **Step 4: Reserve only allowed static routes**

The dynamic content route accepts `about`, `delivery`, `contacts`,
`privacy-policy`, and `thank-you`; any other slug calls `notFound()`.

- [ ] **Step 5: Verify and commit**

Run: `npm test && npm run typecheck && npm run build`

Commit: `feat(frontend): render CMS pages and homepage sections`

### Task 8: Validated lead submission

**Files:**
- Create: `frontend/src/lib/leads/schema.ts`
- Create: `frontend/src/lib/leads/schema.test.ts`
- Create: `frontend/src/lib/leads/create-lead.ts`
- Create: `frontend/src/app/api/leads/route.ts`
- Create: `frontend/src/app/api/leads/route.test.ts`
- Create: `frontend/src/components/forms/LeadForm.tsx`
- Create: `frontend/src/components/forms/LeadForm.test.tsx`

**Interfaces:**
- Produces: `leadSchema`, `POST /api/leads`, reusable `LeadForm`.

- [ ] **Step 1: Write failing validation tests**

Reject an empty phone, oversized values, unknown properties, invalid email,
non-http page URLs, and absent spam token when required. Accept normalized UTM,
product, and category identifiers.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/lib/leads src/app/api/leads src/components/forms`

- [ ] **Step 3: Implement the server endpoint**

Allowlist parsed fields, verify Turnstile when configured, apply an IP-based
rate-limit adapter, create the lead through the server client, and return only
`{ ok: true }` or a user-safe typed error.

- [ ] **Step 4: Implement the accessible form**

Use labeled fields, inline and summary errors, `aria-live`, pending state,
hidden page/product/category/UTM context, and redirect to `/thank-you`.

- [ ] **Step 5: Verify and commit**

Run: `npm test && npm run typecheck && npm run build`

Commit: `feat(frontend): add secure lead capture`

### Task 9: Metadata, structured data, sitemap, robots, and revalidation

**Files:**
- Create: `frontend/src/components/seo/JsonLd.tsx`
- Create: `frontend/src/components/seo/SeoText.tsx`
- Create: `frontend/src/lib/seo/metadata.ts`
- Create: `frontend/src/lib/seo/metadata.test.ts`
- Create: `frontend/src/app/sitemap.ts`
- Create: `frontend/src/app/robots.ts`
- Create: `frontend/src/app/api/revalidate/route.ts`
- Create: `frontend/src/app/api/revalidate/route.test.ts`

**Interfaces:**
- Produces: metadata mapper, Breadcrumb/Product/Organization JSON-LD,
  sitemap, robots, authenticated tag revalidation.

- [ ] **Step 1: Write failing metadata and webhook tests**

Assert canonical URLs use `NEXT_PUBLIC_SITE_URL`, non-indexable pages emit
`robots.index=false`, JSON-LD is serialized with `<` escaped, and revalidation
rejects an invalid secret.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/lib/seo src/app/api/revalidate`

- [ ] **Step 3: Implement SEO outputs**

Include only published/indexable records in sitemap. Reference
`/sitemap.xml` from robots and disallow `/api/` and Directus technical paths.

- [ ] **Step 4: Implement revalidation**

Read `x-revalidate-secret`, compare it with `REVALIDATE_SECRET`, map the
collection to cache tags, and call `revalidateTag`.

- [ ] **Step 5: Verify and commit**

Run: `npm test && npm run typecheck && npm run build`

Commit: `feat(frontend): complete SEO and revalidation`

### Task 10: Production container and full QA

**Files:**
- Create: `frontend/Dockerfile`
- Create: `frontend/.dockerignore`
- Modify: `deploy/compose.production.yml`
- Modify: `deploy/Caddyfile`
- Modify: `deploy/README.md`
- Create: `docs/LAUNCH_CHECKLIST.md`

**Interfaces:**
- Produces: production frontend service on port 3000 behind Caddy.

- [ ] **Step 1: Add frontend healthcheck and container build**

Use a multi-stage Node Alpine build with Next standalone output and a
`/api/health` route that does not disclose environment values.

- [ ] **Step 2: Wire production services**

Pass `DIRECTUS_URL=http://directus:8055`, the server-only token,
`NEXT_PUBLIC_SITE_URL=https://deere-shop.ru`, and revalidation secret through
Compose. Route root and `www` to `frontend:3000`; keep
`cms.deere-shop.ru` routed to Directus.

- [ ] **Step 3: Run automated verification**

Run:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
docker build -t jd-landing-frontend:test .
```

- [ ] **Step 4: Run browser verification**

Check 320, 768, 1024, and 1440 widths; keyboard navigation; catalog search and
filters; product missing-image state; one successful and one rejected lead;
console/network errors; titles/canonicals/JSON-LD; and absence of the Directus
token in HTML and JavaScript.

- [ ] **Step 5: Deploy only after backup and smoke-test**

Create database/uploads backups, apply schema/access/import, deploy the saved
container state, verify `/`, `/catalog`, a category, a product,
`/sitemap.xml`, `/robots.txt`, and CMS health, then record the results in
`docs/LAUNCH_CHECKLIST.md`.

- [ ] **Step 6: Commit**

Commit: `chore(deploy): ship Next.js catalog stack`
