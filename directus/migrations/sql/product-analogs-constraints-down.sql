-- Down: rollback for the typed product analog constraints (R8, Task 12).
--
-- Drops ONLY the CHECK and UNIQUE constraints. The products_analogs rows and
-- the products.analogs_from / analogs_to aliases are RETAINED for analysis
-- (plan rollback policy); removing the collection is a separate cleanup
-- release after the rollback report.
--
-- Idempotent; safe to re-run.

ALTER TABLE products_analogs
  DROP CONSTRAINT IF EXISTS products_analogs_canonical_key_unique;

ALTER TABLE products_analogs
  DROP CONSTRAINT IF EXISTS products_analogs_no_self_check;
