import { describe, expect, it } from "vitest";

import { safeSameOriginPath, safeUrl } from "./urls";

describe("safeUrl", () => {
  it("replaces JavaScript URLs with the fallback", () => {
    expect(safeUrl("javascript:alert(1)", "/catalog")).toBe("/catalog");
  });

  it("allows relative, HTTPS, mailto and tel destinations", () => {
    expect(safeUrl("/catalog/parts")).toBe("/catalog/parts");
    expect(safeUrl("https://example.com/path")).toBe("https://example.com/path");
    expect(safeUrl("mailto:manager@example.com")).toBe("mailto:manager@example.com");
    expect(safeUrl("tel:+74951234567")).toBe("tel:+74951234567");
  });

  it("rejects protocol-relative and data URLs", () => {
    expect(safeUrl("//evil.example", "/")).toBe("/");
    expect(safeUrl("data:text/html,<script>alert(1)</script>", "/")).toBe("/");
  });
});

describe("safeSameOriginPath", () => {
  it("permits only absolute local paths", () => {
    expect(safeSameOriginPath("/catalog?sort=popular")).toBe("/catalog?sort=popular");
    expect(safeSameOriginPath("https://evil.example")).toBeNull();
    expect(safeSameOriginPath("//evil.example")).toBeNull();
  });
});
