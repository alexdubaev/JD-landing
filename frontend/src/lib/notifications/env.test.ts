import { afterEach, describe, expect, it, vi } from "vitest";

import { getSmtpEnv, isNotificationsEnabled } from "./env";

const completeEnv = {
  SMTP_HOST: "smtp.example.test",
  SMTP_PORT: "587",
  SMTP_USER: "sender",
  SMTP_PASSWORD: "secret",
  NOTIFY_EMAIL_TO: "manager@example.test",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("notifications env", () => {
  it("parses a complete SMTP configuration", () => {
    const env = getSmtpEnv({
      ...completeEnv,
      SMTP_SECURE: "true",
      SMTP_FROM: "no-reply@example.test",
    });
    if (!env) throw new Error("expected a complete env");

    expect(env.SMTP_PORT).toBe(587);
    expect(env.SMTP_SECURE).toBe(true);
    expect(isNotificationsEnabled(env)).toBe(true);
  });

  it("treats SMTP_SECURE as false by default", () => {
    const env = getSmtpEnv({ ...completeEnv });
    expect(env?.SMTP_SECURE).toBe(false);
  });

  it("returns null instead of a partial configuration", () => {
    expect(getSmtpEnv({})).toBeNull();
    expect(
      getSmtpEnv({
        SMTP_HOST: "smtp.example.test",
        SMTP_USER: "sender",
        SMTP_PASSWORD: "secret",
        NOTIFY_EMAIL_TO: "manager@example.test",
      }),
    ).toBeNull();
  });

  it("keeps isNotificationsEnabled working on raw parsed envs", () => {
    expect(isNotificationsEnabled(getSmtpEnv({ ...completeEnv })!)).toBe(true);
    expect(isNotificationsEnabled({ SMTP_SECURE: false })).toBe(false);
  });
});

describe("partial configuration warning", () => {
  it("warns exactly once when only part of the SMTP set is present", async () => {
    vi.resetModules();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getSmtpEnv: freshGetSmtpEnv } = await import("./env");

    const env = freshGetSmtpEnv({ SMTP_HOST: "smtp.example.test" });
    expect(env).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("partially configured"),
    );

    freshGetSmtpEnv({ SMTP_HOST: "smtp.example.test" });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("does not warn when nothing is configured (expected dev state)", async () => {
    vi.resetModules();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getSmtpEnv: freshGetSmtpEnv } = await import("./env");

    expect(freshGetSmtpEnv({})).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
