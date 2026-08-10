import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

describe("homepage hero responsive media", () => {
  it("keeps the CMS hero image visible on desktop and hides it on phones", () => {
    expect(styles).toMatch(
      /\.commerce-hero__media\s*\{[\s\S]*?z-index:\s*0;/u,
    );
    expect(styles).toMatch(
      /@media \(max-width: 48rem\)\s*\{[\s\S]*?\.commerce-hero__media\s*\{[\s\S]*?display:\s*none;/u,
    );
  });
});
