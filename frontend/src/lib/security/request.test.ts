import { describe, expect, it } from "vitest";

import {
  RequestTooLargeError,
  getTrustedClientIp,
  readBodyWithinLimit,
} from "./request";

const streamRequest = (chunks: string[]) => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
  return new Request("https://example.test/api/leads", {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit);
};

describe("readBodyWithinLimit", () => {
  it("rejects a chunked request after its actual byte budget", async () => {
    await expect(
      readBodyWithinLimit(streamRequest(["abc", "def"]), 5),
    ).rejects.toBeInstanceOf(RequestTooLargeError);
  });

  it("accepts a chunked request that stays within the byte budget", async () => {
    const body = await readBodyWithinLimit(streamRequest(["ab", "cd"]), 4);
    expect(new TextDecoder().decode(body)).toBe("abcd");
  });
});

describe("getTrustedClientIp", () => {
  it("accepts exactly one valid forwarded address", () => {
    expect(
      getTrustedClientIp(new Headers({ "x-forwarded-for": "203.0.113.8" })),
    ).toBe("203.0.113.8");
  });

  it("rejects ambiguous, malformed, and missing forwarded addresses", () => {
    expect(
      getTrustedClientIp(
        new Headers({ "x-forwarded-for": "203.0.113.8, 10.0.0.1" }),
      ),
    ).toBeNull();
    expect(
      getTrustedClientIp(new Headers({ "x-forwarded-for": "attacker" })),
    ).toBeNull();
    expect(getTrustedClientIp(new Headers())).toBeNull();
  });
});
