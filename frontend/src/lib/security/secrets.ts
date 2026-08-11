import { timingSafeEqual } from "node:crypto";

const PLACEHOLDER_PREFIX = "replace-with-";

/**
 * Compares two strings without exposing matching prefixes through early exit.
 * A length mismatch cannot be compared with timingSafeEqual, so it is rejected
 * before comparison; production secrets are opaque fixed-length values.
 */
export function safeEqual(received: string | null, expected: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(typeof received === "string" ? received : "");
  const sameLength = receivedBuffer.length === expectedBuffer.length;
  // timingSafeEqual rejects buffers of different lengths. Compare a
  // same-sized dummy value first so malformed secrets do not take an early
  // return that can expose a matching-prefix timing signal.
  const comparable = sameLength ? receivedBuffer : Buffer.alloc(expectedBuffer.length);

  return sameLength && timingSafeEqual(comparable, expectedBuffer);
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
