import { timingSafeEqual } from "node:crypto";

const PLACEHOLDER_PREFIX = "replace-with-";

/**
 * Compares two strings without exposing matching prefixes through early exit.
 * A length mismatch cannot be compared with timingSafeEqual, so it is rejected
 * before comparison; production secrets are opaque fixed-length values.
 */
export function safeEqual(received: string | null, expected: string): boolean {
  if (typeof received !== "string" || received.length === 0) return false;
  if (received.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export function requireProductionSecret(
  name: string,
  value: string | undefined,
  minLength: number,
  nodeEnv = process.env.NODE_ENV,
): string | undefined {
  if (nodeEnv !== "production") return value;

  if (
    !value ||
    value.length < minLength ||
    value.toLocaleLowerCase("en").startsWith(PLACEHOLDER_PREFIX)
  ) {
    throw new Error(`${name} must be configured with a non-placeholder value in production`);
  }

  return value;
}
