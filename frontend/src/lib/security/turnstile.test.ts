import { afterEach, describe, expect, it, vi } from "vitest";

import { verifyTurnstile } from "./turnstile";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("verifyTurnstile", () => {
  it("keeps the existing explicit opt-out outside production", async () => {
    await expect(
      verifyTurnstile({
        token: undefined,
        remoteIp: null,
        secret: undefined,
      }),
    ).resolves.toBe(true);
  });

  it("does not reject every lead while the optional production secret is absent", async () => {
    await expect(
      verifyTurnstile({
        token: undefined,
        remoteIp: null,
        secret: undefined,
      }),
    ).resolves.toBe(true);
  });

  it("does not call the provider without a configured visitor token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      verifyTurnstile({
        token: undefined,
        remoteIp: null,
        secret: "s".repeat(32),
      }),
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns false when the provider request times out", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new DOMException("timed out", "TimeoutError"));

    await expect(
      verifyTurnstile({
        token: "visitor-token",
        remoteIp: "203.0.113.8",
        secret: "s".repeat(32),
        timeoutMs: 1,
      }),
    ).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns false for a non-success provider response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: false }), { status: 200 }),
    );

    await expect(
      verifyTurnstile({
        token: "visitor-token",
        remoteIp: "203.0.113.8",
        secret: "s".repeat(32),
      }),
    ).resolves.toBe(false);
  });
});
