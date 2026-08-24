-- Up: typed product analog constraints (R8, Task 12).
--
-- Operator-run with psql against the production PostgreSQL IN THE SAME
-- maintenance window as the release, AFTER:
--   1) `npm run schema:apply` created the products_analogs collection and the
--      products.analogs_from / analogs_to alias metadata (Directus REST cannot
--      run raw SQL);
--   2) `npm run migrations:product-analogs-reconcile` proved the (still empty)
--      table state.
--
-- Every statement is idempotent (constraint existence checks through
-- pg_constraint — Postgres has no ADD CONSTRAINT IF NOT EXISTS) and safe to
-- re-run.
--
-- 1) No self-edges: product_from = product_to is always a data bug (an edge
--    relates TWO different products).
-- 2) UNIQUE canonical_key: for the symmetric types (analog / oem_cross /
--    compatible) canonical_key derives from the SORTED id pair, so the unique
--    constraint PHYSICALLY forbids storing both A->B and B->A of the same
--    type; superseded_by keys keep the from/to direction, so only the exact
--    same directed edge collides.
-- 3) Both edge endpoints must be real products. These foreign keys are kept
--    here (rather than inferred from Directus relation metadata) because an
--    existing relation record does not repair a missing PostgreSQL constraint.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_analogs_product_from_foreign'
  ) THEN
    ALTER TABLE products_analogs
      ADD CONSTRAINT products_analogs_product_from_foreign
      FOREIGN KEY (product_from)
      REFERENCES products(id)
      ON DELETE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_analogs_product_to_foreign'
  ) THEN
    ALTER TABLE products_analogs
      ADD CONSTRAINT products_analogs_product_to_foreign
      FOREIGN KEY (product_to)
      REFERENCES products(id)
      ON DELETE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_analogs_no_self_check'
  ) THEN
    ALTER TABLE products_analogs
      ADD CONSTRAINT products_analogs_no_self_check
      CHECK (product_from <> product_to);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_analogs_canonical_key_unique'
  ) THEN
    ALTER TABLE products_analogs
      ADD CONSTRAINT products_analogs_canonical_key_unique
      UNIQUE (canonical_key);
  END IF;
END
$$;
