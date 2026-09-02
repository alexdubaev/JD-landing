# DEERE-SHOP Reference-Locked UI Remediation

## Goal

Adapt the existing Next.js presentation to approved UI-01 through UI-14 references without changing Directus data, APIs, dependencies, deployment, or infrastructure. The result must remain usable at 390, 768, 1024, 1280, and 1440 CSS pixels and must not be published in this task.

## Source of truth

- Approved visual references: C:\Users\Elena\Documents\Codex\2026-09-01\www-deere-shop-ru-ui-ux\audit-assets\ui-01-*.png through ui-14-*.png.
- Existing editable CMS fields and factual site settings remain authoritative.
- Existing local brand and media assets may be used only when they correspond to the referenced role. A missing CMS image is omitted; no generated or unrelated technical illustration may replace it.

## Reference lock

Preserve dark-green, off-white, and safety-yellow roles; low-radius geometry; thin engineering rules; the Inter system font stack; accessible semantic controls; and existing search/cart/form behavior. Yellow denotes a decisive action, not a decorative surface. Do not add fonts, images, icon packages, gradients, fabricated factual claims, badges, testimonials, or official John Deere status.

## Responsive composition contract

- Header: one compact row. At mobile/tablet widths desktop navigation is absent; logo, cart, and menu retain 44px controls. Escape closes the menu and restores focus.
- Hero: desktop uses an image-led split; mobile has a bounded media band followed by readable copy. Search remains one input-and-submit instrument. CMS list/Excel/photo routes remain available as touch-friendly actions.
- Proof rail: desktop has up to four factual benefits; mobile has at most three title-only cells.
- Categories/products: preserve CMS media and content. Cards never clip required title, SKU, price/status, or primary action.
- Process: desktop is a compact four-step board; mobile is a vertical numbered rail, not four equal-height cards.
- Company: use only populated legal/contact data. companyImageId is the sole optional media source.
- Delivery, contacts, and company pages: direct route-specific hierarchy with breadcrumbs, one H1, factual modules, normal anchors, and the existing lead form.
- Mobile contact bar: only published actions render and all page content reserves its height plus the safe-area inset.

## Scope lock

Allowed implementation: frontend presentation components and tests, frontend/src/app/globals.css, and the route selector required for service presentation. New presentation components live only in frontend/src/components/pages/. This worktree owns these design and plan docs.

Protected: Directus schema/data/roles/permissions, API/lead/order/security code, product/category records and route data behavior, dependencies and lockfiles, environment files, next.config.ts, Docker, deploy/, Caddy, VPS configuration, analytics behavior, and production publishing.

Verification routes: /, /catalog, /catalog/[categorySlug], representative product, /delivery, /contacts, /about; visual regression smoke for /privacy-policy and /thank-you.

## Explicit residual

The references use a condensed display face that is not installed or licensed in the project. The implementation retains Inter and matches hierarchy, spacing, contrast, and composition without adding a font dependency.

