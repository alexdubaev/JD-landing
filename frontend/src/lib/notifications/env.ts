import "server-only";

import { z } from "zod";

/**
 * Optional SMTP configuration for manager lead notifications.
 *
 * All variables are optional: when they are not set, notifications are silently
 * disabled (the lead is still stored in Directus). This mirrors how Turnstile
 * behaves when its secret is missing, so a misconfigured environment never
 * blocks a lead from being created.
 *
 * At minimum, these must be set together to enable email:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, NOTIFY_EMAIL_TO
 */
const smtpEnvSchema = z.object({
  SMTP_HOST: z.string().trim().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  SMTP_USER: z.string().trim().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_FROM: z.string().trim().min(1).optional(),
  NOTIFY_EMAIL_TO: z.string().trim().min(1).optional(),
});

export type SmtpEnv = z.infer<typeof smtpEnvSchema>;

/** The subset of SmtpEnv that is guaranteed when notifications are enabled. */
export type CompleteSmtpEnv = SmtpEnv & {
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USER: string;
  SMTP_PASSWORD: string;
  NOTIFY_EMAIL_TO: string;
};

let partialConfigWarned = false;

/**
 * Notifications are enabled only when the full SMTP set is present.
 * A partial configuration is treated as "disabled" to avoid sending mail from
 * the wrong account or to the wrong recipient — but unlike a fully empty
 * environment (the expected dev state) it is almost certainly a typo, so it
 * is reported once per process.
 */
export function isNotificationsEnabled(env: SmtpEnv): boolean {
  const complete = Boolean(
    env.SMTP_HOST &&
      env.SMTP_PORT &&
      env.SMTP_USER &&
      env.SMTP_PASSWORD &&
      env.NOTIFY_EMAIL_TO,
  );
  if (!complete && !partialConfigWarned) {
    const anySet = Boolean(
      env.SMTP_HOST ||
        env.SMTP_PORT ||
        env.SMTP_USER ||
        env.SMTP_PASSWORD ||
        env.SMTP_FROM ||
        env.NOTIFY_EMAIL_TO,
    );
    if (anySet) {
      partialConfigWarned = true;
      console.warn(
        "[notifications] partially configured — disabled. Check SMTP_* / NOTIFY_* vars",
      );
    }
  }
  return complete;
}

/**
 * Returns the SMTP configuration only when it is complete enough to send
 * mail, or null otherwise. Callers never need non-null assertions on the
 * required fields.
 */
export function getSmtpEnv(
  environment: Partial<NodeJS.ProcessEnv> = process.env,
): CompleteSmtpEnv | null {
  const env = smtpEnvSchema.parse(environment);
  return isNotificationsEnabled(env) ? (env as CompleteSmtpEnv) : null;
}
