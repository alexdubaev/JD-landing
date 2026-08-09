import { describe, expect, it } from "vitest";

import { getServerSnapshot } from "./context";

describe("CartProvider", () => {
  it("returns the same server snapshot reference on every call", () => {
    expect(getServerSnapshot()).toBe(getServerSnapshot());
  });
});
