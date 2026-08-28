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

  it("rejects an invalid payload (short phone) with 400 before any network call", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await POST(
      new Request("https://example.test/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Иван",
          phone: "123",
          email: "",
          items: [{ sku: "RE504836", title: "Деталь", unit_price: 1, quantity: 1 }],
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects more than 100 line items (schema cap) with 400", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const items = Array.from({ length: 101 }, (_, index) => ({
      sku: `SKU-${index}`,
      title: "Деталь",
      unit_price: 1,
      quantity: 1,
    }));

    const response = await POST(
      new Request("https://example.test/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Иван",
          phone: "+7 900 000-00-00",
          email: "",
          items,
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects the submission with 400 when Turnstile verification fails", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "s".repeat(32));
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false }), { status: 200 }),
      );

    const response = await POST(
      new Request("https://example.test/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Иван",
          phone: "+7 900 000-00-00",
          email: "",
          turnstile_token: "visitor-token",
          items: [{ sku: "RE504836", title: "Деталь", unit_price: 1, quantity: 1 }],
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Не удалось подтвердить отправку",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns the created order id and writes all line items in one batch POST", async () => {
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
        new Response(
          JSON.stringify({ data: [{ id: "item-1" }, { id: "item-2" }] }),
          { status: 200 },
        ),
      );

    const response = await POST(
      new Request("https://example.test/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Иван",
          phone: "+7 900 000-00-00",
          email: "",
          turnstile_token: "visitor-token",
          items: [
            { sku: "RE504836", title: "Деталь 1", unit_price: 100, quantity: 2 },
            { sku: "RE504842", title: "Деталь 2", unit_price: 50, quantity: 1 },
          ],
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      order_id: "order-1",
    });

    const itemWrites = fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.endsWith("/items/order_items"));
    expect(itemWrites).toHaveLength(1);
    const batchBody = JSON.parse(
      fetchMock.mock.calls[2][1]?.body as string,
    ) as unknown[];
    expect(batchBody).toHaveLength(2);
  });

  it("compensates with a DELETE of the order when the line-item batch fails", async () => {
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
        new Response("directus down", { status: 500 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const response = await POST(
      new Request("https://example.test/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Иван",
          phone: "+7 900 000-00-00",
          email: "",
          turnstile_token: "visitor-token",
          items: [{ sku: "RE504836", title: "Деталь", unit_price: 1, quantity: 1 }],
        }),
      }),
    );

    expect(response.status).toBe(503);
    const deleteCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith("/items/orders/order-1") && init?.method === "DELETE",
    );
    expect(deleteCall).toBeDefined();
  });
});
