import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

describe("catalog filter layout", () => {
  it("keeps the five desktop filters in one row", () => {
    expect(styles).toMatch(
      /\.catalog-filters--with-category\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/u,
    );
  });
});
