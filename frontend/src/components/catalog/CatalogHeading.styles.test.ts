import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

describe("catalog heading layout", () => {
  it("keeps the desktop title on one line with the description below it", () => {
    expect(styles).toMatch(
      /\.catalog-heading\s*\{[^}]*max-width:\s*none;[^}]*grid-template-columns:\s*1fr;/u,
    );
    expect(styles).toMatch(
      /\.catalog-heading h1\s*\{[^}]*font-size:\s*clamp\(2\.5rem,\s*4\.5vw,\s*4rem\);[^}]*white-space:\s*nowrap;/u,
    );
    expect(styles).toMatch(
      /@media \(max-width:\s*68rem\)[\s\S]*?\.catalog-heading h1\s*\{[^}]*white-space:\s*normal;/u,
    );
  });
});
