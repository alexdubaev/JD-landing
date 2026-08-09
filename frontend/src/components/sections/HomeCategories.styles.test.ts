import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = readFileSync("src/app/globals.css", "utf8");

describe("homepage category density", () => {
  it("keeps six desktop category cards within the compact catalog width", () => {
    expect(styles).toMatch(
      /\.home-categories \.site-container\s*\{[\s\S]*?80rem[\s\S]*?\}/u,
    );
    expect(styles).toMatch(
      /\.home-categories \.home-category,\s*\.home-categories \.home-category > a\s*\{[\s\S]*?70px[\s\S]*?\}/u,
    );
  });
});
