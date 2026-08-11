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

  it("enforces CSP without inline or eval script exemptions", async () => {
    const headers = await nextConfig.headers?.();
    const csp = headers?.[0]?.headers.find(({ key }) => key === "Content-Security-Policy")?.value;

    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/u);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-eval/u);
    expect(headers?.[0]?.headers.some(({ key }) => key === "Content-Security-Policy-Report-Only")).toBe(false);
  });
});
