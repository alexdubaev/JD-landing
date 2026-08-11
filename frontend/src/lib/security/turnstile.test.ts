import { describe, expect, it, vi } from "vitest";

import { verifyTurnstile } from "./turnstile";

describe("verifyTurnstile", () => {
  it("fails closed when its secret is missing in production", async () => {
    await expect(
      verifyTurnstile({ token: "visitor-token", remoteIp: null, secret: undefined, nodeEnv: "production" }),
    ).resolves.toBe(false);
  });

  it("permits an unconfigured local development form", async () => {
    await expect(
      verifyTurnstile({ token: undefined, remoteIp: null, secret: undefined, nodeEnv: "development" }),
    ).resolves.toBe(true);
  });

  it("does not call the verification provider without a visitor token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(
      verifyTurnstile({ token: undefined, remoteIp: null, secret: "a".repeat(32), nodeEnv: "production" }),
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
