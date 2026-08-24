-- Release B SEO Factory shadow migration.
-- Run after the Directus schema blueprint has created seo_work_items.
-- This SQL is additive, repeatable, and intentionally contains no data delete.
-- The endpoint claims rows with SELECT ... FOR UPDATE SKIP LOCKED inside the
-- same transaction before changing status to processing.

CREATE TABLE IF NOT EXISTS seo_factory_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  release_id text NOT NULL
);

CREATE TABLE IF NOT EXISTS seo_factory_claims (
  work_item_id uuid PRIMARY KEY,
  run_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('processing', 'draft_created', 'retryable')),
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  draft_id uuid,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seo_factory_claims_lease_idx
  ON seo_factory_claims (state, lease_until);

INSERT INTO seo_factory_migrations (id, release_id)
VALUES ('seo-factory-shadow-001', :'release_id')
ON CONFLICT (id) DO NOTHING;
