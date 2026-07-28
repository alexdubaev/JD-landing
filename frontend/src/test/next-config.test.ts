import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

describe("Next image configuration", () => {
  it("allows transformed images from the protected local media route", () => {
    expect(nextConfig.images?.localPatterns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pathname: "/media/**",
        }),
        expect.objectContaining({
          pathname: "/brand/**",
        }),
        expect.objectContaining({
          pathname: "/images/**",
        }),
      ]),
    );
  });
});
