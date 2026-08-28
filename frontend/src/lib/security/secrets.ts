import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time comparison of a provided secret against the expected one.
 * `timingSafeEqual` throws on mismatched buffer lengths, so the length check
 * runs first — it leaks only the secret length, never the contents.
 */
export function secretsMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}
