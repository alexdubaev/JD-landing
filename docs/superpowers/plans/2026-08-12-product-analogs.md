# Product Analogs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store analog part numbers separately from product names, display them on the product page, update the matching imported products from the supplied CSV, and deploy the result.

**Architecture:** Add a JSON `analog_skus` field to the Directus `products` schema because a product can have multiple replacements. Map it to a string array in the server-side catalog client and render it next to the primary SKU. A guarded import script will match CSV values by normalized SKU, update only matching products, and write a compact reconciliation report.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Directus 12, Node.js CSV parsing.

## Global Constraints

- Never overwrite product price, availability, image, or category during analog updates.
- Match records by normalized SKU only; fail before writes if a source SKU is duplicated or missing from Directus.
- Keep replacements as factual source data and do not claim compatibility beyond the supplied CSV.
- Preserve the existing default catalog prioritization of curated products.
- Deploy only after focused tests, typecheck, and production build pass.

---

### Task 1: Add the Directus field and catalog data contract

**Files:**
- Modify: `directus/schema/blueprint.mjs`
- Modify: `directus/schema/blueprint.test.mjs`
- Modify: `directus/schema/ui-translations.mjs`
- Modify: `frontend/src/types/catalog.ts`
- Modify: `frontend/src/lib/directus/catalog.ts`
- Test: `frontend/src/lib/directus/catalog.test.ts`

**Interfaces:**
- Produces `Product.analogSkus: string[]`.
- Reads Directus `products.analog_skus` JSON values and filters non-string/blank entries.

- [ ] **Step 1: Write the failing schema/client test**

```ts
expect(url.searchParams.get("fields")).toContain("analog_skus");
expect(product.analogSkus).toEqual(["PGF7949", "RE210102"]);
```

- [ ] **Step 2: Run the focused test and verify it fails because the field is absent from the product data contract.**

Run: `npx vitest run src/lib/directus/catalog.test.ts --reporter=verbose`

- [ ] **Step 3: Add `analog_skus` as a JSON Directus product field and map it to `analogSkus`.**

```ts
field("analog_skus", "json"),
analogSkus: asStringArray(raw.analog_skus),
```

- [ ] **Step 4: Run the focused catalog and schema tests.**

Run: `npx vitest run src/lib/directus/catalog.test.ts && node --test directus/schema/blueprint.test.mjs`

### Task 2: Render replacements on product pages

**Files:**
- Modify: `frontend/src/components/catalog/ProductDetail.tsx`
- Modify: `frontend/src/app/catalog/[categorySlug]/[productSlug]/page.test.tsx`

**Interfaces:**
- Consumes `product.analogSkus` from Task 1.
- Produces visible text `Замены: <SKU list>` only when replacements exist.

- [ ] **Step 1: Add a failing product-page test.**

```ts
getProductBySlugsMock.mockResolvedValue({
  ...product,
  analogSkus: ["PGF7949", "RE210102"],
});
expect(screen.getByText(/Замены: PGF7949, RE210102/)).toBeInTheDocument();
```

- [ ] **Step 2: Run the test and verify it fails because the replacement list is not rendered.**

Run: `npx vitest run "src/app/catalog/[categorySlug]/[productSlug]/page.test.tsx" --reporter=verbose`

- [ ] **Step 3: Render the replacement list adjacent to the primary SKU.**

```tsx
{product.analogSkus.length ? (
  <p className="product-detail__analogs">
    Замены: {product.analogSkus.join(", ")}
  </p>
) : null}
```

- [ ] **Step 4: Run the focused page test.**

Run: `npx vitest run "src/app/catalog/[categorySlug]/[productSlug]/page.test.tsx" --reporter=verbose`

### Task 3: Reconcile the supplied analog CSV with Directus

**Files:**
- Create: `scripts/apply-product-analogs.mjs`
- Output: `outputs/deere-supplier-import-2026-08-12/product-analog-reconciliation.csv`

**Interfaces:**
- Consumes a semicolon-delimited source CSV with `Артикул`, `Аналоги`, and `Товар` columns.
- Updates only `products.title` and `products.analog_skus` for matched normalized SKUs.
- Emits rows with source SKU, old title, new title, analog list, and update status.

- [ ] **Step 1: Add preflight validation for duplicate source SKUs and unresolved Directus SKUs.**

```js
if (duplicateSkus.length || unmatchedSkus.length) {
  throw new Error(JSON.stringify({ duplicateSkus, unmatchedSkus }));
}
```

- [ ] **Step 2: Run the preflight in dry-run mode against production.**

Run: `node scripts/apply-product-analogs.mjs --dry-run --input=<source-csv>`

- [ ] **Step 3: Apply title and analog updates in bounded batches, then write reconciliation CSV.**

```js
await request("/items/products", {
  method: "PATCH",
  body: JSON.stringify({ keys, data: { title, analog_skus } }),
});
```

- [ ] **Step 4: Verify 53 matched records in Directus have the expected analog field.**

Run: production aggregate query filtered by `analog_skus[_nnull]` and the import source.

### Task 4: Deploy and verify production

**Files:**
- Modify: deployment branch and production release checkout.

- [ ] **Step 1: Run focused tests, `npm run typecheck`, and `npm run build`.**
- [ ] **Step 2: Commit only the schema, UI, tests, and import script; merge into `main`.**
- [ ] **Step 3: Apply schema on production, run the reconciler, deploy frontend, and revalidate `products`.**
- [ ] **Step 4: Verify an updated product page shows the new title and its replacement list.**
