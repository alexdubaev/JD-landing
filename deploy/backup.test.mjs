import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const script = await readFile(new URL("./backup.sh", import.meta.url), "utf8");

test("backup keeps the working local PostgreSQL and uploads artifacts", () => {
  assert.match(script, /pg_dump[\s\S]*directus-\$\{timestamp\}\.dump/u);
  assert.match(script, /tar -czf[\s\S]*uploads-\$\{timestamp\}\.tar\.gz/u);
  assert.match(script, /install -d -m 700/u);
  assert.match(script, /mtime \+14/u);
});

test("backup does not unconditionally switch to restic-only storage", () => {
  assert.doesNotMatch(script, /restic backup/u);
  assert.doesNotMatch(script, /RESTIC_REPOSITORY/u);
});
