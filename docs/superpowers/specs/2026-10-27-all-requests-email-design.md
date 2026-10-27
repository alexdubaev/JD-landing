# All website requests must reach email

Owner request: every request from the website, including cart orders and all forms, must also be emailed to the existing configured recipient. The owner has requested autonomous execution; choices below are lead rulings, not a claim of approval of a separate design document.

## Behaviour
- Reuse configured SMTP/NOTIFY_EMAIL_TO (currently info@cmteh.ru); no recipient, credentials, role or schema changes.
- Contact dialog remains email-only. Normal product/category lead forms and bulk requests always attempt email after existing validation and CAPTCHA, independently of CMS write/upload failure.
- For a valid ordinary lead, either a saved CMS record or a successfully accepted email is sufficient for the existing success response. If both channels fail, return 503 and preserve the client draft. Never describe a failed CMS save as saved in notification copy.
- Successfully persisted cart orders also send an order email. Preserve canonical server-side product titles/SKUs/prices, quantities, totals, order ID, contacts, source URL and attribution in that notification. Invalid/rejected orders do not send mail. A mail outage must not turn an already persisted order into a failed checkout and cause duplicate orders on retry.
- Validated CSV/Excel/photo uploads are attached as bytes to the email, including when CMS upload/create fails. Existing limits, MIME checks and cleanup of orphaned uploads remain in effect.
- Mail is a bounded attempt through the existing provider; this change does not add a durable outbox or promise inbox delivery while SMTP is unavailable.

## Approaches
1. Only add a cart notification: too narrow, because current leads:create denial still prevents ordinary/bulk mail.
2. Independently notify valid leads and add authoritative order notifications: chosen by lead as the smallest change meeting the request while preserving successful order handling.
3. Add a persistent mail queue/outbox: deferred, because it requires schema/infrastructure changes and exceeds this request.

## Protected areas
Directus permissions/schema/accounts, secrets/env, dependencies, deploy configuration, Caddy, catalogue records and unrelated UI/SEO remain read-only. Do not send real messages or create production test leads/orders.

## Acceptance
Real local SMTP fixture receives contact, ordinary/bulk lead with attachment despite CMS 403, and an authoritative cart order. Invalid/CAPTCHA-denied inputs send no mail. Mail failure preserves a saved order; both-channel failure keeps failed leads retryable. Existing frontend suite, lint, typecheck and production build pass. Release preserves 0b5a516, with the previous explicit no-main-merge instruction respected.
