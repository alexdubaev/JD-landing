# Task 4B brief — trust, FAQ, final conversion and SEO

## Company trust

- Extend `site_settings` with optional `legal_name`, `vat_info`, `requisites_url`, `documents_url`, `company_image`; map existing `city`, `inn`, `kpp`, `ogrn`, `legal_address` too.
- Add `HomeCompanyTrust` after process. Render only when meaningful factual CMS values exist. No stock/placeholder image and no unsupported prose.
- Fallback heading: «DEERE-SHOP — специализированное направление компании СМ ТЕХНО»; CMS remains authoritative.

## Recent supplies

- Add translation-ready `recent_supplies` collection with publication status, image/alt, equipment_type, positions JSON, region, delivery_term, supply_format, supplied_at, sort and timestamps.
- Frontend reads published records. Section returns `null` for an empty list. Do not seed records.

## FAQ

- Sync the 12 plan1.md questions with cautious answers that do not assert VAT, minimum order, carriers, price, stock or terms not present in CMS.
- Keep one-open accordion, keyboard and ARIA. Every answer must remain in initial server HTML for SEO; animation may hide visually but must not conditionally remove closed answers.

## Final contact node

- Evolve the existing unified `HomeContactHub`, do not create a duplicate contact/form section.
- Fallback title/text: «Не нашли нужную деталь?» / «Отправьте артикул, список или фотографию маркировки. Менеджер проверит варианты поставки».
- Actions: «Отправить запрос», «Загрузить список», phone only when factual; email/hours and published Telegram/WhatsApp only when present.

## Mobile bar

- <=768 px fixed bottom actions: Call if phone, Message if published messenger, Request always. Render only available channels and reserve body/footer space.

## Analytics

- Provider-neutral `trackEvent` sends to an existing `window.dataLayer` when present and otherwise no-ops. No new provider.
- Instrument search, submit search, Excel, paste/list, photo, lead submit, phone, messenger, product add-to-request, article open and FAQ open.

## Structured data

- Homepage `Organization` uses factual settings only; `WebSite` + `SearchAction`; `FAQPage` from published FAQ.
- Do not emit offers/availability/price in Product schema unless complete, factual product data exists.

## Tests and constraints

- TDD for mapping/conditional sections/HTML FAQ/mobile actions/JSON-LD/analytics adapter.
- No fictional recent supplies or legal data. Preserve CMS editability and existing merged contact/form flow.
