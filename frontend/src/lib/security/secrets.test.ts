import { describe, expect, it } from "vitest";

import { requireProductionSecret, safeEqual } from "./secrets";

describe("safeEqual", () => {
  it("rejects a same-prefix secret with a different length", () => {
    expect(safeEqual("a".repeat(31), "a".repeat(32))).toBe(false);
  });

  it("accepts an exact secret match", () => {
    expect(safeEqual("a".repeat(32), "a".repeat(32))).toBe(true);
  });
});

describe("requireProductionSecret", () => {
  it("rejects missing and placeholder secrets in production", () => {
    expect(() => requireProductionSecret("REVALIDATE_SECRET", undefined, 32, "production")).toThrow();
    expect(() => requireProductionSecret("REVALIDATE_SECRET", "replace-with-secret-value-123456", 32, "production")).toThrow();
  });

  it("allows an unset secret outside production", () => {
    expect(requireProductionSecret("REVALIDATE_SECRET", undefined, 32, "development")).toBeUndefined();
  });
});
