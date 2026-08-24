import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { applySeoFactoryShadowMigration } from "./seo-factory-shadow.mjs";

test("shadow migration is journaled, repeatable, and does not delete data", async () => {
  const statements = [];
  const client = {
    async query(sql, params) {
      statements.push({ sql, params });
      return { rows: [] };
    },
  };
  const first = await applySeoFactoryShadowMigration(client, { releaseId: "release-b-test" });
  const second = await applySeoFactoryShadowMigration(client, { releaseId: "release-b-test" });
  assert.equal(first.migration, "seo-factory-shadow");
  assert.equal(second.migration, "seo-factory-shadow");
  assert.ok(statements.some(({ sql }) => /CREATE TABLE IF NOT EXISTS seo_factory_migrations/iu.test(sql)));
  assert.ok(statements.some(({ sql }) => /INSERT INTO seo_factory_migrations/iu.test(sql)));
  assert.ok(statements.every(({ sql }) => !/\bDROP\s+TABLE|\bDELETE\s+FROM/iu.test(sql)));
});

test("SQL migration supports empty PostgreSQL 17 and repeatable claim table", async () => {
  const sql = await readFile(new URL("./sql/seo-factory-shadow-up.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS seo_factory_migrations/iu);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS seo_factory_claims/iu);
  assert.match(sql, /FOR UPDATE/iu);
  assert.match(sql, /ON CONFLICT/iu);
  assert.doesNotMatch(sql, /DROP\s+TABLE/iu);
});
