# John Deere catalog frontend design

Status: approved through the project implementation plan and the instruction to
proceed with implementation.

## Goal and scope

Build a production Next.js App Router storefront for the 12-collection
Directus model. The site is a neutral catalog and request channel for John
Deere-related products and parts; it must not imply official representative
status. The initial release includes the homepage, catalog, category and
product routes, informational pages, lead submission, metadata, sitemap,
robots, breadcrumbs, and structured data.

The upstream Vibe repository is not copied as an application because its
public site uses Astro and its web application uses Vite. The Next.js frontend
will preserve its useful visual patterns: restrained green brand token,
high-contrast typography, generous but disciplined layout, small-radius
controls, subtle motion, reusable section introductions, and reduced-motion
support.

## Architecture

- `frontend/` is a standalone Next.js application using TypeScript and App
  Router.
- Server Components are the default. Search/filter controls and mobile
  navigation are isolated Client Components.
- `src/lib/directus/` owns the server-only HTTP client and all query functions.
  No component calls Directus directly.
- Every content query includes an explicit publication filter because Directus
  12 Core cannot enforce row-level publication rules.
- The Directus token is read only from `DIRECTUS_TOKEN`; it is never exposed
  through a `NEXT_PUBLIC_*` variable or serialized into a client component.
- Catalog filters and pagination live in URL search parameters, producing
  shareable and crawl-safe states.
- Published pages use cached server fetches and tag-based revalidation.
  Form submission and preview-like operations are dynamic.

## Visual system

The interface uses an industrial editorial direction: off-white and white
surfaces, charcoal text, restrained deep green for primary actions, and a
small yellow safety accent used only for emphasis. It avoids trademark-like
logo reconstruction, excessive green/yellow striping, gradients, rounded
cards everywhere, and heavy shadows.

Typography is compact and readable. Product names and SKU are prioritized over
marketing claims. Cards expose image, category, title, SKU, price state, and
availability state with a single clear consultation action. Missing images
use a deliberately designed neutral placeholder.

Layouts are mobile-first and verified at 320, 768, 1024, and 1440 pixels.
Interactive controls have visible keyboard focus and do not rely on color
alone. Motion is limited to small reveal and hover transitions and respects
`prefers-reduced-motion`.

## Routes and composition

- `/`: header, hero, category navigation, selected products, advantages,
  ordering process, consultation CTA, catalog preview, SEO content, lead form,
  FAQ, contacts, and footer.
- `/catalog`: search, category/availability/price-state filters, sort,
  paginated product grid, empty state, and catalog SEO content.
- `/catalog/[categorySlug]`: breadcrumbs, category introduction, the same
  catalog controls scoped to the category, FAQ, internal links, and SEO text.
- `/catalog/[categorySlug]/[productSlug]`: gallery, title/SKU, price and
  availability, description, specifications, documents, lead CTA, FAQ,
  related products, breadcrumbs, and Product JSON-LD.
- `/about`, `/delivery`, `/contacts`, `/privacy-policy`, `/thank-you`: driven
  by `pages` and `page_sections`.

Shared components are grouped into `layout`, `sections`, `catalog`, `forms`,
`seo`, and small `ui` primitives. Page-section rendering is an explicit
`section_type` registry; unknown types are ignored safely and logged on the
server.

## Data flow

1. A route calls a typed query in `src/lib/directus/`.
2. The query uses the server token, adds `status=published`, limits selected
   fields, and expands only required relations.
3. The route maps the API record into view props and renders server-side.
4. Directus file IDs are converted to local `/media/{id}` URLs. A Next.js
   server route verifies that the file belongs to the designated public folder
   before proxying it with the server-only token.
5. A lead form posts to a Server Action or route handler. The server
   allowlists fields, validates contact data, checks the anti-spam control,
   normalizes UTM/page context, and writes through the `Frontend API` role.
6. Successful submissions redirect to `/thank-you`; failures preserve entered
   non-sensitive values and present an accessible error summary.

## Failure and empty states

- CMS timeouts or malformed responses produce a logged server error and a
  stable page-level fallback, not a client exception.
- Missing optional content hides that section without breaking the page.
- Empty catalog results explain which filters are active and offer a reset.
- Missing product/category records use `notFound()`.
- Missing images use a local accessible placeholder.
- Form rate-limit, validation, spam, and upstream errors return distinct
  user-safe messages without exposing Directus details.

## SEO

Each indexable route has one H1 and dynamic Metadata API output with title,
description, canonical URL, and Open Graph image. Category and product pages
include breadcrumbs and JSON-LD. SEO body copy is rendered as structured,
useful content, never keyword blocks. `sitemap.ts` includes published pages,
categories, and products; `robots.ts` references the canonical sitemap and
blocks non-public technical routes.

## Testing and acceptance

- Unit tests cover Directus query construction, publication filters, record
  mapping, URL filters, metadata, and lead validation.
- Component tests cover product-card edge cases, empty states, and form errors.
- Build, typecheck, lint, and tests must pass.
- Browser verification covers keyboard navigation, console errors, responsive
  layouts, missing images, catalog filters, product pages, and lead submission.
- No browser response or client bundle may contain the Directus token.
