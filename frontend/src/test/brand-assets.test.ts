import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("DEERE-SHOP brand assets", () => {
  it("uses the wide transparent logo supplied in the asset pack", async () => {
    const png = await readFile(
      join(process.cwd(), "public", "brand", "deere-shop-logo.png"),
    );

    expect(png.readUInt32BE(16)).toBe(1829);
    expect(png.readUInt32BE(20)).toBe(251);
    expect(png[25]).toBe(6);
  });
});
