import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

describe("product detail compact layout", () => {
  it("uses a compact title and an unframed product image", () => {
    expect(styles).toContain("font-size: clamp(1.5rem, 3vw, 2.5rem);");
    expect(styles).toMatch(
      /\.product-gallery__main,\s*\.product-gallery__empty\s*\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/,
    );
    expect(styles).toMatch(
      /\.product-gallery__main img\s*\{[\s\S]*?padding:\s*0;/,
    );
  });

  it("keeps the missing-image fallback fully visible", () => {
    expect(styles).toMatch(
      /\.product-card__media img\.product-card__fallback-image\s*\{[\s\S]*?object-fit:\s*contain;/,
    );
    expect(styles).toMatch(
      /\.product-gallery__empty img\.product-gallery__fallback-image\s*\{[\s\S]*?object-fit:\s*contain;/,
    );
  });
});
