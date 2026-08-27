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

test("backup points docker compose at the release checkout, not the project root", () => {
  assert.match(script, /release\/deploy\/compose\.production\.yml/u);
  assert.match(script, /-f "\$\{compose_file\}"/u);
  assert.doesNotMatch(script, /-f compose\.production\.yml/u);
});

test("backup verifies the dump archive before finishing", () => {
  assert.match(script, /pg_restore --list/u);
  const dump = script.indexOf("directus-${timestamp}.dump");
  const verify = script.indexOf("pg_restore --list");
  assert.ok(dump >= 0 && verify > dump, "verification runs on the produced dump");
});

test("backup does not unconditionally switch to restic-only storage", () => {
  assert.doesNotMatch(script, /restic backup/u);
  assert.doesNotMatch(script, /RESTIC_REPOSITORY/u);
});
