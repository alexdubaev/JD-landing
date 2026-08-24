import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/orders", () => {
  it("rejects a chunked JSON body after the order byte limit", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024 + 1));
        controller.close();
      },
    });

    const response = await POST(
      new Request("https://example.test/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: stream,
        duplex: "half",
      } as RequestInit),
    );

    expect(response.status).toBe(413);
  });

  it("passes only a single canonical forwarded IP to Turnstile", async () => {
    vi.stubEnv("DIRECTUS_URL", "https://cms.example.test");
    vi.stubEnv("DIRECTUS_TOKEN", "server-token-for-tests-only");
    vi.stubEnv(
      "DIRECTUS_PUBLIC_FOLDER_ID",
      "1ecf70c5-0ad4-4e5e-8d73-78ee549f064a",
    );
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "s".repeat(32));
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { id: "order-1" } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { id: "order-item-1" } }), { status: 200 }),
      );

    const orderInput = {
      name: "Иван",
      phone: "+7 900 000-00-00",
      email: "",
      turnstile_token: "visitor-token",
      items: [
        {
          sku: "RE504836",
          title: "Тестовая деталь",
          unit_price: 100,
          quantity: 1,
        },
      ],
    };

    const response = await POST(
      new Request("https://example.test/api/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.8",
        },
        body: JSON.stringify(orderInput),
      }),
    );

    expect(response.status).toBe(201);
    const turnstileBody = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(turnstileBody.get("remoteip")).toBe("203.0.113.8");
  });
});
