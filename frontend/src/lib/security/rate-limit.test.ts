import { afterEach, describe, expect, it } from "vitest";

import { checkRateLimit, resetRateLimits } from "./rate-limit";

afterEach(() => resetRateLimits());

describe("checkRateLimit", () => {
  it("allows the configured number of requests and then returns retry metadata", () => {
    const policy = { limit: 2, windowMs: 60_000 };

    expect(checkRateLimit("/api/leads:203.0.113.8", policy).allowed).toBe(true);
    expect(checkRateLimit("/api/leads:203.0.113.8", policy).allowed).toBe(true);
    const blocked = checkRateLimit("/api/leads:203.0.113.8", policy);

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps separate keys isolated", () => {
    const policy = { limit: 1, windowMs: 60_000 };

    expect(checkRateLimit("/api/leads:unknown", policy).allowed).toBe(true);
    expect(checkRateLimit("/api/leads:203.0.113.8", policy).allowed).toBe(true);
  });
});
