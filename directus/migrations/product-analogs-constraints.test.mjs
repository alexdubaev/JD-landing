import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const constraintsFile = new URL(
  "./sql/product-analogs-constraints-up.sql",
  import.meta.url,
);
const rollbackFile = new URL(
  "./sql/product-analogs-constraints-down.sql",
  import.meta.url,
);

test("product analog constraints retain both product foreign keys with cascading deletes", async () => {
  const sql = await readFile(constraintsFile, "utf8");
  const rollback = await readFile(rollbackFile, "utf8");

  for (const field of ["product_from", "product_to"]) {
    assert.match(
      sql,
      new RegExp(
        `products_analogs_${field}_foreign[\\s\\S]*FOREIGN KEY \\(${field}\\)[\\s\\S]*REFERENCES products\\(id\\)[\\s\\S]*ON DELETE CASCADE`,
        "u",
      ),
    );
    assert.match(
      rollback,
      new RegExp(
        `DROP CONSTRAINT IF EXISTS products_analogs_${field}_foreign`,
        "u",
      ),
    );
  }
});
