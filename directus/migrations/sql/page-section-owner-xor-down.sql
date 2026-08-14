-- Down: rollback for the page_sections owner-XOR migration (R4).
--
-- Step 1 (this file): drop the exactly-one-owner CHECK constraint so rows can
-- temporarily hold both or neither owner again.

ALTER TABLE page_sections
  DROP CONSTRAINT IF EXISTS page_sections_exactly_one_owner_check;

-- Step 2: restore both owner fields on every row from the release packet
-- before-state.ndjson (one line per row: id, page, home_page). Ready-to-run
-- per-row UPDATE statements are embedded in the same packet:
-- page-section-owner-plan.json -> rollbackStatements.
--
-- Step 3: make page_sections.page required again (meta + NOT NULL) AFTER the
-- rows are restored, via:
--   node migrations/migrate-page-section-owners.mjs \
--     --restore --apply --before-state=<release-dir>/before-state.ndjson
--
-- Step 4: repeat route QA for /, /about, /delivery, /contacts, /parts-request
-- (order and visibility of all 13 sections).
