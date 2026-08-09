# Task 3 brief — bulk parts request

## Outcome

Add the main homepage workbench «Проверьте список запчастей» and submit a validated multipart lead to the existing Directus-backed leads system.

## Required behavior

- Textarea accepts one item per line, optional quantity, ignores blanks, normalizes whitespace, deduplicates matching article lines and enforces 1–100 unique items.
- Draft text survives reload in localStorage and can be cleared explicitly.
- Accept one spreadsheet (`.xls`, `.xlsx`, `.csv`) and one product/marking photo (`.jpg`, `.jpeg`, `.png`, `.webp`), show file name/size and allow removal.
- Validate extension, MIME when provided, and maximum sizes on both client and server. Never claim an XLS/XLSX file was parsed in the browser.
- Form includes name, phone, optional email and consent; captures page URL and UTM values.
- `POST /api/leads` remains compatible with existing JSON `LeadForm` submissions and additionally accepts multipart data.
- Server uploads validated attachments to Directus files, stores their IDs plus normalized request items with the lead, and never exposes the Directus token.
- Add optional `request_items` JSON and `attachments` JSON fields to the Directus leads blueprint and tests.
- UI copy follows plan1.md exactly where specified; factual response-time/manager claims remain absent unless CMS provides them.

## Suggested seams

- Pure parser/validator module under `src/lib/leads/parts-request.ts` with table-driven tests.
- `BulkPartsRequest` client component under `src/components/forms/`.
- Server helper for file validation/upload; keep route orchestration small.
- Add a `bulk_request` homepage section type or render immediately after categories based on the plan's fixed homepage composition; preserve CMS title/text overrides if a matching section is added later.

## TDD gates

1. Parser tests fail because module/API is missing.
2. Route tests fail for valid multipart and reject invalid/oversized/101-item requests.
3. Component tests fail for persistence, file removal and submitted normalized payload.
4. Implement minimal code; run focused tests and full suite.

## Out of scope

- Price/stock lookup, manager response-time promises, Excel binary parsing, external notifications, product request basket, deployment.
