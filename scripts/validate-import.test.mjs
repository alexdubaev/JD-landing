import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("validator fails when an input file is missing", () => {
  const missingDir = mkdtempSync(join(tmpdir(), "jd-import-validation-"));
  const missingProducts = join(missingDir, "products.json");
  const missingCategories = join(missingDir, "categories.json");

  try {
    const result = spawnSync(
      process.execPath,
      // Resolve the script relative to this test file, not the caller's cwd:
      // node --test may run from any directory (repo root, CI, a package).
      [
        fileURLToPath(new URL("./validate-import.mjs", import.meta.url)),
        missingProducts,
        missingCategories,
      ],
      { encoding: "utf8" },
    );

    assert.notEqual(result.status, 0);
    assert.match(`${result.stderr}${result.stdout}`, /не удалось прочитать|failed to read/iu);
  } finally {
    rmSync(missingDir, { recursive: true, force: true });
  }
});
