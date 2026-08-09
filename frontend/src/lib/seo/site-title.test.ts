import { describe, expect, it } from "vitest";

import { buildRootTitle } from "./site-title";

describe("buildRootTitle", () => {
  it("does not append the shop name to a CMS title", () => {
    expect(buildRootTitle("Каталог комплектующих John Deere", "DEERE-SHOP")).toBe(
      "Каталог комплектующих John Deere",
    );
  });
});
