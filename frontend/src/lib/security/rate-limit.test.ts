import { describe, expect, it } from "vitest";

import { checkRateLimit, resetRateLimits } from "./rate-limit";

describe("checkRateLimit", () => {
  it("rejects requests beyond a fixed IP budget", () => {
    resetRateLimits();
    const policy = { limit: 2, windowMs: 60_000 };

    expect(checkRateLimit("lead:203.0.113.8", policy).allowed).toBe(true);
    expect(checkRateLimit("lead:203.0.113.8", policy).allowed).toBe(true);
    expect(checkRateLimit("lead:203.0.113.8", policy)).toMatchObject({ allowed: false });
  });
});
