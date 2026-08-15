-- Up: indexed SKU/OEM search (R6, Task 10).
--
-- Operator-run with psql against the production PostgreSQL IN THE SAME
-- maintenance window as the release, AFTER:
--   1) `npm run schema:apply` created the hidden products.sku_normalized /
--      products.mpn_normalized fields and the product_codes collection
--      (Directus REST cannot run raw SQL);
--   2) `npm run migrations:product-search -- --apply --release-id=<id>`
--      backfilled the normalized values.
--
-- Every statement is idempotent (IF NOT EXISTS / constraint existence check)
-- and safe to re-run. Run statements one by one or with autocommit on:
-- CREATE/DROP INDEX CONCURRENTLY may not run inside a transaction block.
--
-- B-tree indexes serve the starts_with lookups of the /deere-shop/search
-- endpoint (LIKE 'PREFIX%' is served by a plain B-tree on the normalized,
-- punctuation-free values).

CREATE INDEX CONCURRENTLY IF NOT EXISTS products_sku_normalized_idx
  ON products (sku_normalized);

CREATE INDEX CONCURRENTLY IF NOT EXISTS products_mpn_normalized_idx
  ON products (mpn_normalized);

CREATE INDEX CONCURRENTLY IF NOT EXISTS product_codes_normalized_code_idx
  ON product_codes (normalized_code);

-- Composite uniqueness of a code row per (product, code_type, normalized_code,
-- source_name): the same code MAY repeat for different sources or types, but
-- never for the identical tuple. Postgres has no ADD CONSTRAINT IF NOT EXISTS,
-- hence the pg_constraint guard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_codes_product_type_code_source_unique'
  ) THEN
    ALTER TABLE product_codes
      ADD CONSTRAINT product_codes_product_type_code_source_unique
      UNIQUE (product, code_type, normalized_code, source_name);
  END IF;
END
$$;
