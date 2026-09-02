import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

describe("homepage hero", () => {
  it("uses a solid green background without hero media", () => {
    expect(styles).toMatch(
      /\.commerce-hero\s*\{[\s\S]*?background:\s*#173b25;/u,
    );
  });

  it("keeps the transparent assembly separate from the hero background and preserves a mobile media composition", () => {
    expect(styles).toMatch(
      /\.commerce-hero__assembly\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?pointer-events:\s*none;/u,
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*68rem\)\s*\{[\s\S]*?\.commerce-hero__media\s*\{[\s\S]*?display:\s*block;/u,
    );
    expect(styles).toMatch(/\.commerce-hero__mobile-media\s*\{[\s\S]*?display:\s*block;/u);
  });
});
