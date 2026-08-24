-- Down: rollback for the seo_work_items control-plane constraint (R10A, Task 14).
--
-- Drops ONLY the UNIQUE constraint. The seo_work_items rows are RETAINED for
-- analysis (plan rollback policy); removing the collection is a separate
-- decommission release after the rollback report.
--
-- Idempotent; safe to re-run.

ALTER TABLE seo_work_items
  DROP CONSTRAINT IF EXISTS seo_work_items_dedupe_key_unique;
