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

  it("allows the loopback host used by local browser QA", () => {
    expect(nextConfig.allowedDevOrigins).toContain("127.0.0.1");
  });

  it("leaves CSP to the request proxy, which can attach a per-request nonce", async () => {
    const headers = await nextConfig.headers?.();

    expect(headers?.[0]?.headers.some(({ key }) => key === "Content-Security-Policy")).toBe(false);
  });
});
