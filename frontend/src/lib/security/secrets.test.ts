import { describe, expect, it } from "vitest";

import { secretsMatch } from "./secrets";

describe("secretsMatch", () => {
  it("returns true for equal secrets", () => {
    expect(secretsMatch("test-secret", "test-secret")).toBe(true);
  });

  it("returns false for different secrets of equal length", () => {
    expect(secretsMatch("test-secret", "test-secret!")).toBe(false);
    expect(secretsMatch("aaaaaaaaaa", "bbbbbbbbbb")).toBe(false);
  });

  it("returns false without throwing when lengths differ", () => {
    expect(secretsMatch("short", "a-much-longer-secret")).toBe(false);
    expect(secretsMatch("a-much-longer-secret", "short")).toBe(false);
    expect(secretsMatch("", "secret")).toBe(false);
  });

  it("compares multi-byte characters correctly", () => {
    expect(secretsMatch("секрет-тест", "секрет-тест")).toBe(true);
    expect(secretsMatch("секрет-тест", "секрет-тес­т")).toBe(false);
  });
});
