import { describe, expect, it } from "vitest";

import { getSmtpEnv, isNotificationsEnabled } from "./env";

describe("notifications env", () => {
  it("parses a complete SMTP configuration", () => {
    const env = getSmtpEnv({
      SMTP_HOST: "smtp.example.test",
      SMTP_PORT: "587",
      SMTP_SECURE: "true",
      SMTP_USER: "sender",
      SMTP_PASSWORD: "secret",
      SMTP_FROM: "no-reply@example.test",
      NOTIFY_EMAIL_TO: "manager@example.test",
    });

    expect(env.SMTP_PORT).toBe(587);
    expect(env.SMTP_SECURE).toBe(true);
    expect(isNotificationsEnabled(env)).toBe(true);
  });

  it("treats SMTP_SECURE as false by default", () => {
    const env = getSmtpEnv({ SMTP_SECURE: "false" });
    expect(env.SMTP_SECURE).toBe(false);
  });

  it("disables notifications when required vars are missing", () => {
    const env = getSmtpEnv({});
    expect(isNotificationsEnabled(env)).toBe(false);
  });

  it("disables notifications when port is missing", () => {
    const env = getSmtpEnv({
      SMTP_HOST: "smtp.example.test",
      SMTP_USER: "sender",
      SMTP_PASSWORD: "secret",
      NOTIFY_EMAIL_TO: "manager@example.test",
    });
    expect(isNotificationsEnabled(env)).toBe(false);
  });
});
