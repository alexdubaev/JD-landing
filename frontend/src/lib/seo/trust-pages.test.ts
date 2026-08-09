import { describe, expect, it } from "vitest";

import {
  getTrustPageFallback,
  getTrustPageMetadata,
} from "./trust-pages";

describe("trust-page fallbacks", () => {
  it("returns an indexable delivery page with unique metadata", () => {
    expect(getTrustPageFallback("delivery")?.h1).toBe(
      "Доставка запчастей John Deere",
    );
    expect(getTrustPageMetadata("delivery")).toEqual({
      title: "Доставка запчастей John Deere — DEERE-SHOP",
      description: expect.stringContaining("Доставка"),
    });
  });

  it("does not create a fallback for an unknown information slug", () => {
    expect(getTrustPageFallback("unknown")).toBeNull();
    expect(getTrustPageMetadata("unknown")).toBeNull();
  });
});
