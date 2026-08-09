import { describe, expect, it } from "vitest";

import { directusAssetUrl } from "./assets";

describe("directusAssetUrl", () => {
  it("builds a local authenticated media URL", () => {
    expect(directusAssetUrl("file/id", { width: 800, fit: "cover" })).toBe(
      "/media/file%2Fid?fit=cover&width=800",
    );
  });

  it("returns null when no file is configured", () => {
    expect(directusAssetUrl(null)).toBeNull();
  });
});
