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
});
