import { describe, expect, it } from "vitest";

import {
  RequestTooLargeError,
  getTrustedClientIp,
  readBodyWithinLimit,
} from "./request";

describe("getTrustedClientIp", () => {
  it("uses one valid forwarded address and rejects a spoofable chain", () => {
    expect(getTrustedClientIp(new Headers({ "x-forwarded-for": "203.0.113.8" }))).toBe("203.0.113.8");
    expect(getTrustedClientIp(new Headers({ "x-forwarded-for": "203.0.113.8, 10.0.0.1" }))).toBeNull();
  });
});

describe("readBodyWithinLimit", () => {
  it("rejects a chunked request after its actual byte budget", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("abc"));
        controller.enqueue(new TextEncoder().encode("def"));
        controller.close();
      },
    });
    const request = new Request("https://example.test/api/leads", { method: "POST", body: stream, duplex: "half" } as RequestInit);

    await expect(readBodyWithinLimit(request, 5)).rejects.toBeInstanceOf(RequestTooLargeError);
  });
});
