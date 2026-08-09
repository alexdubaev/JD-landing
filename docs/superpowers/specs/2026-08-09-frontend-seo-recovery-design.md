# Frontend SEO Recovery Design

## Purpose

Correct the high-impact SEO issues found on `deere-shop.ru` without changing the Directus schema or inventing product facts. This is an interim frontend-only implementation; CMS editing support will be added in a later project phase.

## Scope

- Restore the public trust pages (`about`, `delivery`, `contacts`, `privacy-policy`) as indexable pages with unique title, meta description, H1 and self-canonical URLs.
- Include only indexable canonical pages in `sitemap.ts`.
- Add a reusable category SEO block with a manually maintained per-category copy map, unique metadata, selection guidance and internal links. The map must not assert unverified fitment, dimensions, inventory, price or official-dealer status.
- Extend product page copy with only data already supplied by the product record: title, SKU, category, optional weight, images and available documents. Make the fitment verification requirement explicit.
- Correct structured-data URLs: use absolute URLs for images; only emit images, authors and publishers when their source data is available. Remove the obsolete WebSite search action.
- Add regression tests for metadata, sitemap eligibility, SEO copy fallback and schema URL behaviour.

## Non-goals

- No Directus collection, field, permissions or content migration changes.
- No fabricated compatibility lists, technical specifications, prices or stock claims.
- No automatic generation of 19 category texts from a generic template.
- No changes to the production Directus content.

## Architecture

SEO copy and trust-page documents live in focused frontend data modules. Route components consume those modules in server-rendered metadata and visible content, ensuring search crawlers receive the same content as users. Existing Directus product and category records remain the factual source for dynamic product attributes.

## Data flow

`category slug` -> `frontend SEO content map` -> category page metadata + visible SEO section + internal links.

`info-page slug` -> `frontend trust-page document map` -> generic info route metadata + visible page content + indexability.

`Directus product` -> existing product page -> verified detail/selection block + JSON-LD with normalized absolute asset URLs.

`sitemap.ts` -> fixed public routes + Directus catalog/articles -> excludes any route deliberately marked `noindex`.

## Error handling

- An unknown category gets existing factual catalog metadata and no fabricated editorial copy.
- Missing product image means the Product/Article JSON-LD omits `image` rather than emitting an invalid URL.
- A missing optional product field is not rendered as a claim or placeholder.
- Unknown information slugs keep the current 404 behaviour.

## Verification

- Unit tests must demonstrate the red-green cycle for each new data helper.
- Run the frontend test suite, lint and production build.
- Inspect sitemap output and rendered metadata for one trust page, one mapped category, one unmapped category and one product with no image.

## Deferred CMS phase

Move the content maps into Directus fields/collections, expose them to content and SEO managers, and remove the frontend maps once the CMS migration is verified.
