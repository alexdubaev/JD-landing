-- Down: rollback for the indexed SKU/OEM search (R6, Task 10).
--
-- Drops ONLY the indexes and the composite unique constraint. The
-- sku_normalized / mpn_normalized values and the product_codes rows are
-- RETAINED for analysis (plan rollback policy); removing the fields and the
-- collection is a separate cleanup release after the rollback report.
--
-- Idempotent; run with autocommit on (DROP INDEX CONCURRENTLY may not run
-- inside a transaction block).

DROP INDEX CONCURRENTLY IF EXISTS product_codes_normalized_code_idx;
DROP INDEX CONCURRENTLY IF EXISTS products_mpn_normalized_idx;
DROP INDEX CONCURRENTLY IF EXISTS products_sku_normalized_idx;

ALTER TABLE product_codes
  DROP CONSTRAINT IF EXISTS product_codes_product_type_code_source_unique;

DROP INDEX CONCURRENTLY IF EXISTS product_codes_normalized_code_pattern_idx;
DROP INDEX CONCURRENTLY IF EXISTS products_mpn_normalized_pattern_idx;
DROP INDEX CONCURRENTLY IF EXISTS products_sku_normalized_pattern_idx;
