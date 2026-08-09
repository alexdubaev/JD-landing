# Task 4 brief — catalog proof, trust and completion

## Product block

- Rename fallback to «Позиции каталога».
- Extend products with optional CMS fields `brand`, `part_type` (`original|oem|analog`) and `delivery_status` text.
- Homepage query/render requires image, valid title/SKU, numeric fixed price and non-empty delivery status; if no complete products remain, hide the section.
- Card exposes detail link, copy SKU and add/remove request action. A persistent request list supports multiple products and links into the bulk request workbench.
- Never manufacture availability or lead-time labels.

## Process

Use the exact four plan1.md step titles/descriptions, 01–04, existing GSAP transform/opacity motion, no large card treatment.

## Company trust

- Extend `SiteSettings` mapping only for factual CMS values already in schema (`city`, `inn`, `kpp`, `ogrn`, `legal_address`) plus optional `legal_name`, `vat_info`, `requisites_url`, `documents_url`, `company_image` fields added to schema.
- Render the trust section only when at least meaningful factual company data exists. No stock image or placeholder pretending to be the company.
- Title: «DEERE-SHOP — специализированное направление компании СМ ТЕХНО».

## Recent supplies

- Add a `recent_supplies` collection and read function if practical, but homepage renderer must return null on an empty dataset. Do not seed fictional records.

## Knowledge base

- Rename fallback «Полезные материалы».
- Add optional article `category_label` and computed/read-time field or derive reading time from sanitized content without unsupported claims.
- Cards: image, category when present, title, compact excerpt, reading time, «Читать».

## FAQ

- Keep one-open keyboard/ARIA accordion, but ensure answer text remains in server-rendered HTML for SEO (hidden/collapsible CSS or semantic details; animation may enhance without removing content from initial HTML).
- CMS sync seeds the 12 questions from plan1.md only with cautious answers; VAT, minimum order, carriers and contract details must defer to contact/manager unless facts exist.

## Final CTA and mobile bar

- Final title/text/actions from plan1.md. Phone/email/hours/messengers only when published.
- Mobile fixed bar at <=768: Call, Message (only if actual published messenger), Request; reserve bottom padding so content is not covered.

## SEO and analytics

- Homepage JSON-LD: Organization only with factual fields; WebSite + SearchAction; FAQPage from published FAQ. Product schema remains product-page only until complete commercial records exist.
- Add a provider-neutral analytics adapter that dispatches to an existing `dataLayer` when present and otherwise no-ops; instrument plan events without installing a new analytics provider.

## Verification

TDD per behavior; focused suites then full tests/typecheck/lint/build. No deployment or invented seed data.
