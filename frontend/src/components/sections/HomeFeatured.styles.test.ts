import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

describe("featured products section density", () => {
  it("uses a compact section inset instead of the global homepage section spacing", () => {
    expect(styles).toMatch(
      /\.home-section\s*\{[^}]*padding-block:\s*var\(--technical-section\);[^}]*\}\s*\.home-featured\s*\{[^}]*padding-block:\s*1\.5rem;/u,
    );
  });
});
