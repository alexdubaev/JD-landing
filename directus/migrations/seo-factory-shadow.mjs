import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const MIGRATION_ID = "seo-factory-shadow-001";

export async function applySeoFactoryShadowMigration(client, { releaseId } = {}) {
  if (!client || typeof client.query !== "function") throw new Error("migration client.query is required");
  if (!releaseId) throw new Error("releaseId is required");
  const sql = await readFile(new URL("./sql/seo-factory-shadow-up.sql", import.meta.url), "utf8");
  const insertMarker = "INSERT INTO seo_factory_migrations";
  const ddl = sql.slice(0, sql.indexOf(insertMarker));
  await client.query(ddl);
  await client.query(
    "INSERT INTO seo_factory_migrations (id, release_id) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
    [MIGRATION_ID, releaseId],
  );
  return { migration: "seo-factory-shadow", id: MIGRATION_ID, releaseId, applied: true };
}

export const migrationPath = fileURLToPath(new URL("./sql/seo-factory-shadow-up.sql", import.meta.url));
