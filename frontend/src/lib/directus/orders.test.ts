import { beforeEach, describe, expect, it, vi } from "vitest";

import { MARKETING_CONSENT_VERSION } from "@/lib/marketing/consent";

import { directusRequest } from "./client";
import { createOrder, deleteOrder } from "./orders";

vi.mock("./client", () => ({ directusRequest: vi.fn() }));

const requestMock = vi.mocked(directusRequest);

const orderInput = () => ({
  name: "Иван",
  phone: "+7 900 000-00-00",
  email: "ivan@example.test",
  comment: "Позвонить после 18:00",
  page_url: "https://example.test/checkout",
  utm_source: "yandex",
  utm_medium: "cpc",
  utm_campaign: "parts-spring",
  utm_content: undefined,
  utm_term: undefined,
  marketing_consent: true,
  turnstile_token: "visitor-token",
  website: "",
  items: [
    {
      product: "1f0a7c92-33b1-4a1e-9c64-7089bb6c0000",
      sku: "RE504836",
      title: "Муфта компрессора John Deere",
      unit_price: 100,
      quantity: 2,
    },
    {
      product: undefined,
      sku: "RE504842",
      title: "Ремень приводной",
      unit_price: 50,
      quantity: 1,
    },
  ],
});

const callsTo = (path: string) =>
  requestMock.mock.calls.filter(([callPath]) => callPath === path);

const bodyOf = (init: unknown) =>
  JSON.parse((init as { body: string }).body as string);

describe("createOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestMock.mockResolvedValue({ id: "order-1" });
  });

  it("creates the order row with the full validated payload", async () => {
    await createOrder(orderInput());

    const [path, init] = requestMock.mock.calls[0];
    expect(path).toBe("/items/orders");
    expect(init?.method).toBe("POST");
    expect(bodyOf(init)).toEqual({
      customer_name: "Иван",
      phone: "+7 900 000-00-00",
      email: "ivan@example.test",
      comment: "Позвонить после 18:00",
      total: 250,
      currency: "RUB",
      page_url: "https://example.test/checkout",
      utm_source: "yandex",
      utm_medium: "cpc",
      utm_campaign: "parts-spring",
      utm_content: null,
      utm_term: null,
      marketing_consent: true,
      marketing_consent_at: expect.any(String),
      marketing_consent_version: MARKETING_CONSENT_VERSION,
      status: "new",
    });
  });

  it("rounds the order total to two decimals (0.1 + 0.2 IEEE-754 case)", async () => {
    await createOrder({
      ...orderInput(),
      items: [
        { sku: "A", title: "A", unit_price: 0.1, quantity: 1 },
        { sku: "B", title: "B", unit_price: 0.2, quantity: 1 },
      ],
    });

    expect(bodyOf(requestMock.mock.calls[0][1]).total).toBe(0.3);
  });

  it("snapshots price and title from the submitted lines instead of recalculating", async () => {
    await createOrder(orderInput());

    const batchBody = bodyOf(callsTo("/items/order_items")[0][1]);
    // Set comparison: Directus does not guarantee line ordering anywhere.
    expect(
      [...batchBody].sort((a: { sku_snapshot: string }, b: { sku_snapshot: string }) =>
        a.sku_snapshot.localeCompare(b.sku_snapshot),
      ),
    ).toEqual([
      {
        order: "order-1",
        product: "1f0a7c92-33b1-4a1e-9c64-7089bb6c0000",
        sku_snapshot: "RE504836",
        title_snapshot: "Муфта компрессора John Deere",
        unit_price: 100,
        quantity: 2,
        currency: "RUB",
      },
      {
        order: "order-1",
        product: null,
        sku_snapshot: "RE504842",
        title_snapshot: "Ремень приводной",
        unit_price: 50,
        quantity: 1,
        currency: "RUB",
      },
    ]);
  });

  it("rounds each snapshotted unit price to two decimals", async () => {
    await createOrder({
      ...orderInput(),
      items: [
        { sku: "A", title: "A", unit_price: 19.999999999, quantity: 1 },
      ],
    });

    const batchBody = bodyOf(callsTo("/items/order_items")[0][1]);
    expect(batchBody[0].unit_price).toBe(20);
  });

  it("writes all line items in one batch POST against the created order id", async () => {
    requestMock.mockImplementation(async (path) => {
      if (path === "/items/orders") return { id: "order-42" };
      return [{ id: "item-row" }, { id: "item-row-2" }];
    });

    await createOrder(orderInput());

    const itemCalls = callsTo("/items/order_items");
    expect(itemCalls).toHaveLength(1);
    const batchBody = bodyOf(itemCalls[0][1]);
    expect(Array.isArray(batchBody)).toBe(true);
    expect(batchBody).toHaveLength(2);
    for (const line of batchBody) {
      expect(line.order).toBe("order-42");
    }
    expect(new Set(batchBody.map((line: { sku_snapshot: string }) => line.sku_snapshot))).toEqual(
      new Set(["RE504836", "RE504842"]),
    );
  });

  it("compensates with a DELETE of the order when the batch write fails, then rethrows", async () => {
    requestMock.mockImplementation(async (path, init) => {
      if (path === "/items/orders" && init?.method === "POST") {
        return { id: "order-1" };
      }
      if (path === "/items/order_items") {
        throw new Error("directus item write failed");
      }
      return undefined;
    });

    await expect(createOrder(orderInput())).rejects.toThrow(
      "directus item write failed",
    );

    const deleteCall = requestMock.mock.calls.find(
      ([path, init]) =>
        path === "/items/orders/order-1" && init?.method === "DELETE",
    );
    expect(deleteCall).toBeDefined();
  });

  it("still rethrows the original error when the compensating delete also fails", async () => {
    requestMock.mockImplementation(async (path, init) => {
      if (path === "/items/orders" && init?.method === "POST") {
        return { id: "order-1" };
      }
      throw new Error("directus is down");
    });

    await expect(createOrder(orderInput())).rejects.toThrow(
      "directus is down",
    );
  });
});

describe("deleteOrder", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the order by its encoded id (cascade removes the line items)", async () => {
    requestMock.mockResolvedValue(undefined);
    await deleteOrder("order/1");

    const [path, init] = requestMock.mock.calls[0];
    expect(path).toBe("/items/orders/order%2F1");
    expect(init?.method).toBe("DELETE");
  });
});
