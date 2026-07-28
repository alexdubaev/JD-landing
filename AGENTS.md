# AGENTS.md

## Project

Build a landing-page catalog for John Deere products using:

- Frontend: Next.js
- CMS/Admin: Directus
- Base template: https://github.com/di-sukharev/vibe
- Product volume: approximately 300 products at launch, scalable to 1000+
- SEO approach: follow the principles from Yandex Direct’s article on SEO texts:
  https://direct.yandex.ru/base/articles/seo-tekst-chto-eto-i-kak-pravilno-pisat?ysclid=ms4x0wt9jg144996769

The site must work as a professional landing page and product catalog for John Deere-related products, machinery, parts, or equipment.

Do not position the site as an official John Deere representative unless that status is explicitly confirmed by the project owner. Use neutral wording such as:

- “каталог продукции John Deere”
- “поставка техники и комплектующих”
- “подбор решений под задачи клиента”
- “заявка на консультацию”

## Main Goal

Create a Next.js website based on the `di-sukharev/vibe` template and connect all editable website data to Directus.

No important website content should be hardcoded in the frontend.

The following must be manageable from Directus:

- phone
- email
- messengers
- address
- logo
- favicon
- navigation
- hero block
- section texts
- images
- categories
- products
- product specifications
- product documents
- featured products
- advantages
- CTA blocks
- lead forms
- FAQ
- testimonials
- banners
- SEO title
- SEO description
- Open Graph data
- SEO texts
- H1
- H2-H4 content structure
- image alt texts
- internal links
- footer
- legal pages
- thank-you page
- UTM data in leads

## Required Stack

Use:

- Next.js
- TypeScript
- Directus
- PostgreSQL for Directus
- Directus SDK or Directus REST API
- Next.js App Router unless the existing Vibe template strongly requires another approach
- Server Components by default
- Client Components only where interactivity is required
- `next/image` for images
- Next.js metadata API for SEO
- `sitemap.ts`
- `robots.ts`
- JSON-LD structured data
- Server Actions or API routes for form submission

## Base Template Requirement

Use this repository as the base:

https://github.com/di-sukharev/vibe

Before making implementation decisions, inspect the template and identify:

1. Current framework and stack.
2. Folder structure.
3. Existing layout components.
4. Existing UI components.
5. Existing sections that can be reused.
6. Existing static data.
7. Existing visual patterns.
8. Existing animation system.
9. Existing styling approach.
10. Existing routing approach.

When adapting the template:

- Do not rewrite the template from scratch unless necessary.
- Preserve useful layout, UI, styling, and animation patterns.
- Replace static content with Directus-driven content.
- Convert static landing sections into CMS-driven sections.
- Add catalog, category, product, SEO, and lead functionality.
- Keep the site visually modern, clean, industrial, and conversion-focused.

## Site Structure

Implement the following routes:

- `/`
- `/catalog`
- `/catalog/[categorySlug]`
- `/catalog/[categorySlug]/[productSlug]`
- `/about`
- `/delivery`
- `/contacts`
- `/privacy-policy`
- `/thank-you`

Each page must receive content and SEO data from Directus.

## Homepage Sections

The homepage must include:

1. Header
2. Hero block
3. Product categories
4. Featured products
5. Advantages
6. How selection/order works
7. Consultation banner
8. Catalog preview or product selection
9. SEO text block for homepage
10. Lead form
11. FAQ
12. Contacts
13. Footer

For each section:

- Use data from Directus.
- Allow visibility control from Directus where appropriate.
- Allow CTA text and links to be edited from Directus.
- Reuse Vibe components where possible.
- Create new components only when the template does not already provide a suitable base.

## Directus Collections

Create or plan the following Directus collections:

- `site_settings`
- `navigation_items`
- `hero_blocks`
- `categories`
- `products`
- `product_images`
- `product_specifications`
- `product_documents`
- `advantages`
- `cta_blocks`
- `faq_items`
- `contact_channels`
- `lead_forms`
- `leads`
- `seo_pages`
- `seo_text_blocks`
- `pages`
- `testimonials`
- `banners`

Each collection must include:

- purpose
- fields
- field types
- required/optional status
- example values
- relationships
- translation-ready fields for future multilingual support

## Product Collection

The `products` collection must support:

- `id`
- `status`
- `title`
- `slug`
- `sku`
- `category`
- `short_description`
- `full_description`
- `seo_text`
- `main_image`
- `gallery`
- `price`
- `price_status`
- `availability_status`
- `specifications`
- `documents`
- `seo_title`
- `seo_description`
- `og_image`
- `image_alt`
- `sort_order`
- `is_featured`
- `show_on_homepage`
- `cta_text`
- `related_products`
- `lead_form`
- `created_at`
- `updated_at`

Do not invent real John Deere prices, SKUs, or technical specifications unless they are provided by the project owner. Use placeholder values only where needed.

## SEO Text Collection

Create `seo_text_blocks` for editable SEO content.

Required fields:

- `id`
- `status`
- `page_type`
- `related_page`
- `related_category`
- `related_product`
- `h1`
- `intro_text`
- `content_blocks`
- `conclusion_text`
- `cta_text`
- `primary_keywords`
- `secondary_keywords`
- `search_intent`
- `internal_links`
- `faq_items`
- `image_alt_texts`
- `seo_title`
- `seo_description`
- `og_title`
- `og_description`
- `og_image`
- `canonical_url`
- `sort_order`
- `created_at`
- `updated_at`

SEO texts must be useful for users, not written only for search engines.

## SEO Text Rules

Follow these principles:

- SEO text must answer real user search intent.
- SEO text must help users choose a product, category, or solution.
- Avoid keyword stuffing.
- Avoid empty generic claims like “высокое качество по доступной цене”.
- Use natural commercial language.
- Use short paragraphs.
- Use H1 once per page.
- Use H2 and H3 for meaningful structure.
- Use lists and tables where helpful.
- Add internal links to related categories, products, and pages.
- Add FAQ where useful.
- Add a clear CTA at the end.
- Do not make unsupported claims about price, stock, technical details, or official status.

Recommended SEO text structures:

### Homepage SEO Text

- H1: broad commercial query
- Intro: what the site offers
- H2: available product categories
- H2: how to choose the right product or equipment
- H2: why submit a request
- FAQ
- CTA

### Category SEO Text

- H1: category name
- Intro: category description
- H2: category features
- H2: what to consider when choosing
- H2: popular products
- H2: request selection help
- FAQ
- Internal links to products and related categories

### Product SEO Text

- H1: product name
- Short description
- H2: purpose
- H2: specifications
- H2: delivery or consultation conditions
- H2: related products
- FAQ
- CTA for lead submission

## Next.js Architecture

Use App Router if compatible with the Vibe template.

Recommended structure:

    src/
      app/
        page.tsx
        layout.tsx
        catalog/
          page.tsx
          [categorySlug]/
            page.tsx
            [productSlug]/
              page.tsx
        about/
          page.tsx
        delivery/
          page.tsx
        contacts/
          page.tsx
        privacy-policy/
          page.tsx
        thank-you/
          page.tsx
        api/
          leads/
            route.ts
          revalidate/
            route.ts
        sitemap.ts
        robots.ts
        not-found.tsx
        error.tsx
        loading.tsx
      components/
        layout/
        sections/
        catalog/
        forms/
        seo/
        ui/
      lib/
        directus.ts
        api/
          site.ts
          products.ts
          categories.ts
          leads.ts
          seo.ts
        utils.ts
      types/
        directus.ts
        product.ts
        category.ts
        lead.ts
        seo.ts
      styles/

Adjust this structure to match the actual Vibe template if needed.

## Directus Integration

Implement Directus data access through server-side functions.

Required functions:

- `getSiteSettings`
- `getHeroBlock`
- `getNavigation`
- `getCategories`
- `getProducts`
- `getFeaturedProducts`
- `getProductBySlug`
- `getProductsByCategory`
- `getSeoTextBlock`
- `getFaqItems`
- `getContacts`
- `createLead`

Rules:

- Do not expose private Directus tokens to the client.
- Public content can be read through a safe public Directus role if appropriate.
- Lead creation must go through a server-side Next.js layer.
- Validate forms on the server.
- Use environment variables for all Directus URLs and tokens.
- Use Directus webhooks to trigger Next.js revalidation.
- Use ISR/SSG for catalog and product pages where appropriate.
- Use SSR only where fresh dynamic data is required.

## Catalog Requirements

The catalog must support:

- categories
- subcategories if needed
- filters
- search
- sorting
- pagination
- “show more”
- product detail pages
- related products
- featured products
- products with price on request
- products without price
- products without image
- products with documents
- SEO for every category
- SEO for every product
- FAQ for categories and products

Filters must come from Directus data, not hardcoded frontend arrays.

Recommended filters:

- category
- availability
- product type
- purpose
- technical parameters
- price if available
- popularity

## Components

Required components:

- `Header`
- `Hero`
- `CategoryGrid`
- `ProductCard`
- `ProductGrid`
- `ProductFilters`
- `ProductSearch`
- `ProductDetail`
- `SpecTable`
- `LeadForm`
- `CTASection`
- `FAQ`
- `Contacts`
- `Footer`
- `Breadcrumbs`
- `Pagination`
- `SeoTextBlock`
- `InternalLinks`
- `RelatedProducts`
- `JsonLdSchema`

For each component, define:

- purpose
- props
- Directus data source
- server/client component type
- whether a Vibe component can be reused
- edge cases

## Forms and Leads

Forms must save leads to Directus.

Required lead fields:

- `name`
- `phone`
- `email`
- `message`
- `product`
- `category`
- `page_url`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`
- `created_at`
- `status`
- `manager_comment`

Lead form requirements:

- server-side validation
- spam protection
- UTM capture
- page URL capture
- product/category relation if submitted from a product or category page
- success redirect or success state
- optional email or Telegram notification to manager

## Directus Roles

Create and configure these roles:

### Super Admin

Full access.

### Content Manager

Can create and edit:

- pages
- hero blocks
- products
- categories
- images
- banners
- FAQ
- advantages
- testimonials
- CTA blocks

Should not delete protected collections without approval.

### Sales Manager

Can view and update:

- leads
- lead statuses
- manager comments

Should not edit products, SEO, or global settings.

### SEO Manager

Can edit:

- SEO title
- SEO description
- H1
- SEO texts
- FAQ
- alt texts
- internal links
- Open Graph data

Should not:

- delete products
- edit lead statuses
- change prices
- change sensitive global settings

## Design Direction

The visual design should use the Vibe template as the base and adapt it into a modern industrial catalog.

Style:

- reliable
- industrial
- clean
- modern
- readable
- conversion-focused
- mobile-friendly
- image-driven

Use green/yellow associations carefully and do not violate John Deere brand guidelines.

Editable design-related settings in Directus:

- logo
- favicon
- primary colors
- button labels
- button URLs
- images
- banners
- text sections
- contacts

## SEO Requirements

Implement:

- clean URLs
- unique H1 per page
- dynamic title and description
- canonical URLs
- Open Graph data
- breadcrumbs
- JSON-LD
- sitemap
- robots.txt
- image alt texts
- internal linking
- indexable product pages
- indexable category pages
- metadata API in Next.js
- dynamic `generateMetadata`
- `sitemap.ts`
- `robots.ts`

Example URLs:

- `/`
- `/catalog`
- `/catalog/tractors`
- `/catalog/tractors/john-deere-6155m`

## Infrastructure

Recommended production setup:

- Next.js frontend
- Directus backend
- PostgreSQL
- image/file storage
- SMTP or Telegram notifications
- domain
- SSL
- environment variables
- Directus to Next.js revalidation webhook
- database backups
- file backups
- error monitoring
- analytics
- Yandex Metrica

Possible deployment options:

- Vercel for Next.js + separate VPS for Directus
- single VPS with Docker Compose
- PostgreSQL
- S3-compatible storage or Cloudflare R2

## Analytics

Track:

- form submissions
- phone clicks
- messenger clicks
- catalog visits
- product page visits
- CTA clicks
- search usage
- filter usage

Use Yandex Metrica where appropriate.

## Implementation Plan

1. Inspect the Vibe template.
2. Document the current project structure.
3. Identify reusable components.
4. Identify static content to move into Directus.
5. Set up Directus.
6. Create Directus collections.
7. Configure Directus roles and permissions.
8. Connect Directus to Next.js.
9. Replace static template content with CMS data.
10. Build homepage sections.
11. Build catalog page.
12. Build category pages.
13. Build product pages.
14. Build SEO text rendering.
15. Build lead forms.
16. Save leads to Directus.
17. Implement metadata.
18. Implement sitemap and robots.
19. Implement JSON-LD.
20. Implement Directus revalidation webhook.
21. Add test products.
22. Test responsiveness.
23. Test performance.
24. Test forms.
25. Test SEO text quality.
26. Prepare deployment.

## Quality Checklist

Before considering the task complete, verify:

- The Vibe template is used as the base.
- Next.js is used as the frontend.
- Directus is used as the CMS.
- Static content has been moved to Directus.
- Phone can be changed without a developer.
- Hero block can be changed without a developer.
- Products can be added without a developer.
- SEO metadata can be edited from Directus.
- SEO texts can be edited from Directus.
- CTA blocks can be managed from Directus.
- Leads are linked to products or categories where relevant.
- Catalog supports 300+ products.
- Architecture can scale to 1000+ products.
- Roles and permissions are configured.
- Directus API tokens are not exposed on the client.
- ISR/SSG/SSR strategy is defined.
- Directus webhook revalidation is planned.
- SEO texts are useful, structured, readable, and not spammy.
- The site does not falsely claim official John Deere representative status.
- The administrator workflow is clear.
- The developer workflow is clear.

## Final Output Expected From Agents

When working on this project, agents should produce:

1. Summary of the project.
2. Analysis of the Vibe template.
3. What to keep from the template.
4. What to replace.
5. What to add.
6. Recommended page structure.
7. Full Directus collection structure.
8. CMS field table.
9. Next.js architecture.
10. Frontend component list.
11. API/data-fetching plan.
12. TypeScript examples for Directus + Next.js.
13. SEO structure.
14. SEO text templates for homepage, categories, and products.
15. Admin scenarios.
16. Directus roles and permissions.
17. Template adaptation plan.
18. Development plan.
19. Developer checklist.
20. Launch checklist for the project owner.
