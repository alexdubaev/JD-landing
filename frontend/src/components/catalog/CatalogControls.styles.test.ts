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

  it("keeps the desktop search and filters compact without shrinking controls below 44px", () => {
    expect(styles).toMatch(
      /\.catalog-search\s*\{[^}]*padding:\s*0\.75rem 1rem;/u,
    );
    expect(styles).toMatch(
      /\.catalog-filters label\s*\{[^}]*gap:\s*0\.25rem;[^}]*padding:\s*0\.75rem 1rem;/u,
    );
    expect(styles).toMatch(
      /\.catalog-filters select\s*\{[^}]*min-height:\s*2\.75rem;/u,
    );
  });
});
