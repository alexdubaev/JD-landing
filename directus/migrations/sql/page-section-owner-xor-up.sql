-- Up: page_sections owner-XOR migration (R4).
--
-- Execute with psql against the production PostgreSQL in the SAME maintenance
-- window as `node migrations/migrate-page-section-owners.mjs --apply
-- --release-id=<id>` (row patches + nullable page field meta). Directus REST
-- cannot run raw SQL, so this file is the operator-executed final step.
--
-- Precondition: the migration script already reconciled 13 rows / 11
-- home-owned / 2 page-owned / 0 invalid. The CHECK below only validates the
-- single-owner rule going forward.

ALTER TABLE page_sections
  DROP CONSTRAINT IF EXISTS page_sections_exactly_one_owner_check;

ALTER TABLE page_sections
  ADD CONSTRAINT page_sections_exactly_one_owner_check
  CHECK (num_nonnulls(page, home_page) = 1);
