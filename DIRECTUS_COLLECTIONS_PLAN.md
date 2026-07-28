# Directus collections plan

The project uses Directus `12.1.1` and deliberately stays below the Directus
Core limit of 25 custom collections. The production model contains exactly 12
collections:

1. `site_settings`
2. `pages`
3. `page_sections`
4. `navigation_items`
5. `categories`
6. `products`
7. `faq_items`
8. `lead_forms`
9. `leads`
10. `testimonials`
11. `banners`
12. `seo_redirects`

The executable definition is
[`directus/schema/blueprint.mjs`](directus/schema/blueprint.mjs). The checked-in
Directus snapshot is generated from that definition and is not the source of
truth.

## Consolidation rules

- Global contacts, branding, footer data, legal details, and the primary CTA
  belong in `site_settings`.
- Ordinary page SEO belongs in `pages`; category and product SEO stays on the
  corresponding record.
- Hero, advantages, order steps, CTA, contact, catalog-preview, and other
  reusable page blocks belong in `page_sections`.
- Product gallery, documents, specifications, and related-product identifiers
  are JSON fields on `products`.
- FAQ remains separate because it needs page, category, and product relations.
- `leads` remains separate because it has its own access rules and workflow.
- Translation-ready content is represented by JSON `translations` fields in
  the relevant collections. This avoids extra translation collections while
  preserving a migration path to a normalized multilingual model later.

This replaces the earlier normalized collections such as `hero_blocks`,
`advantages`, `cta_blocks`, `contact_channels`, `seo_pages`,
`seo_text_blocks`, `product_images`, `product_documents`, and
`product_specifications`.

## Directus 12 Core access model

Directus 12 Core accepts collection/action permissions but does not allow the
custom row filters or field-level restrictions required by the ideal role
model. Therefore:

- the public Directus policy has no permissions;
- the browser never receives a Directus token;
- Next.js uses a server-only `Frontend API` account;
- Next.js always adds publication filters to content queries;
- lead validation, spam protection, field allowlisting, and UTM normalization
  happen in the Next.js server layer before `leads:create`;
- Content Manager has create/read/update access but no delete access;
- Sales Manager can read/update all lead fields, not only workflow fields;
- SEO Manager can create/update whole SEO-bearing records, not only SEO fields.

The wider Sales and SEO field access is a known Core-edition compromise.
Administrative training and audit logging are required. If strict field-level
separation becomes mandatory, the project must use a Directus edition that
supports custom permission rules.

Directus Core also limits active users. The server-only API account consumes
one seat, so separate simultaneous accounts for every managerial role require
checking the installed license before provisioning users.

## Scaling

The compact schema remains suitable for 300 products at launch and 1000+
products later. Products and categories stay first-class, indexed collections;
only low-cardinality nested data is stored as JSON. If filtering by an
individual technical specification becomes a business requirement, promote
that data to a dedicated collection only after measuring the need and
rechecking the collection limit.
