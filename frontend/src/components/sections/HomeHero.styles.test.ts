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

  it("offsets the assembly illustration 100px left and 70px down", () => {
    expect(styles).toMatch(
      /\.commerce-hero__assembly\s*\{[\s\S]*?top:\s*calc\(clamp\(3rem,\s*3\.3vw,\s*4\.75rem\)\s*\+\s*70px\);[\s\S]*?right:\s*calc\(clamp\(2rem,\s*4vw,\s*6rem\)\s*\+\s*100px\);/u,
    );
  });
});
