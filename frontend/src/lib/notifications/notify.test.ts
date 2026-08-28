import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { notifyNewLead } from "./notify";

const baseLead = {
  name: "Иван",
  phone: "+7 900 000-00-00",
  email: "ivan@example.test",
};

const enableSmtp = () => {
  vi.stubEnv("SMTP_HOST", "smtp.example.test");
  vi.stubEnv("SMTP_PORT", "465");
  vi.stubEnv("SMTP_USER", "sender@example.test");
  vi.stubEnv("SMTP_PASSWORD", "secret");
  vi.stubEnv("NOTIFY_EMAIL_TO", "manager@example.test");
};

describe("notifyNewLead", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("does nothing when SMTP env vars are absent", async () => {
    const sendMail = vi.fn();
    vi.doMock("nodemailer", () => ({
      createTransport: () => ({ sendMail }),
    }));
    const result = await notifyNewLead(baseLead);

    expect(result).toBeNull();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("does nothing when only some SMTP env vars are set", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.test");
    vi.stubEnv("SMTP_PORT", "465");
    const sendMail = vi.fn();
    vi.doMock("nodemailer", () => ({
      createTransport: () => ({ sendMail }),
    }));

    const result = await notifyNewLead(baseLead);

    expect(result).toBeNull();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends an email with lead details when fully configured", async () => {
    enableSmtp();
    vi.stubEnv("SMTP_FROM", "no-reply@example.test");
    const sendMail = vi
      .fn()
      .mockResolvedValue({ messageId: "ok" });
    vi.doMock("nodemailer", () => ({
      createTransport: () => ({ sendMail }),
    }));

    const result = await notifyNewLead({
      ...baseLead,
      message: "Нужен подбор",
      product: "RE504836",
      requestItems: [{ article: "RE504836", quantity: 2 }],
    });

    expect(result).toBe("manager@example.test");
    expect(sendMail).toHaveBeenCalledTimes(1);
    const args = sendMail.mock.calls[0][0];
    expect(args.to).toBe("manager@example.test");
    expect(args.from).toContain("no-reply@example.test");
    expect(args.subject).toContain("Иван");
    expect(args.text).toContain("RE504836");
    expect(args.html).toContain("RE504836 — 2 шт.");
  });

  it("swallows transport errors and returns null", async () => {
    enableSmtp();
    const sendMail = vi.fn().mockRejectedValue(new Error("SMTP down"));
    vi.doMock("nodemailer", () => ({
      createTransport: () => ({ sendMail }),
    }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await notifyNewLead(baseLead);

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("defaults the sender to SMTP_USER when SMTP_FROM is unset", async () => {
    enableSmtp();
    const sendMail = vi.fn().mockResolvedValue({});
    vi.doMock("nodemailer", () => ({
      createTransport: () => ({ sendMail }),
    }));

    await notifyNewLead(baseLead);

    const args = sendMail.mock.calls[0][0];
    expect(args.from).toContain("sender@example.test");
  });

  it("creates the transport with bounded connection and socket timeouts", async () => {
    enableSmtp();
    const transportOptions: Array<{
      connectionTimeout?: number;
      socketTimeout?: number;
    }> = [];
    const createTransport = vi.fn((options: {
      connectionTimeout?: number;
      socketTimeout?: number;
    }) => {
      transportOptions.push(options);
      return { sendMail: vi.fn().mockResolvedValue({}) };
    });
    vi.doMock("nodemailer", () => ({ createTransport }));

    await notifyNewLead(baseLead);

    expect(transportOptions[0].connectionTimeout).toBe(5_000);
    expect(transportOptions[0].socketTimeout).toBe(5_000);
  });
});
