import { beforeEach, describe, expect, it, vi } from "vitest";

import { MARKETING_CONSENT_VERSION } from "@/lib/marketing/consent";

import { directusRequest } from "./client";
import {
  createOrder,
  deleteOrder,
  OrderAmountOutOfRangeError,
  UnavailableOrderItemsError,
} from "./orders";

vi.mock("./client", () => ({ directusRequest: vi.fn() }));

const requestMock = vi.mocked(directusRequest);
const productIds = [
  "1f0a7c92-33b1-4a1e-9c64-7089bb6c0000",
  "1f0a7c92-33b1-4a1e-9c64-7089bb6c0001",
];
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
    { product: productIds[0], sku: "TAMPERED-1", title: "Поддельное название", unit_price: 0.01, quantity: 2 },
    { product: productIds[1], sku: "TAMPERED-2", title: "Старое название", unit_price: 999999, quantity: 1 },
  ],
});
const products = [
  { id: productIds[0], status: "published", title: "Муфта компрессора John Deere", sku: "RE504836", price: "100.10", currency: "RUB", price_status: "fixed" },
  { id: productIds[1], status: "published", title: "Ремень приводной", sku: "RE504842", price: 50, currency: "RUB", price_status: "fixed" },
];
const callsTo = (path: string) => requestMock.mock.calls.filter(([callPath]) => callPath.startsWith(path));
const bodyOf = (init: unknown) => JSON.parse((init as { body: string }).body);

beforeEach(() => {
  vi.clearAllMocks();
  requestMock.mockImplementation(async (path) => {
    if (path.startsWith("/items/products?")) return products;
    if (path === "/items/orders") return { id: "order-1" };
    if (path === "/items/order_items") return [{ id: "item-row" }, { id: "item-row-2" }];
    return undefined;
  });
});

describe("createOrder", () => {
  it("reads current published product snapshots before writing and ignores client snapshots", async () => {
    await createOrder(orderInput());

    expect(requestMock.mock.calls.map(([path]) => path.startsWith("/items/products?") ? "read" : path)).toEqual([
      "read", "/items/orders", "/items/order_items",
    ]);
    const read = requestMock.mock.calls[0];
    expect(read[1]).toMatchObject({ cache: "no-store" });
    const params = new URLSearchParams(read[0].split("?")[1]);
    expect(params.get("filter[status][_eq]")).toBe("published");
    expect(params.get("filter[id][_in]")).toBe(productIds.join(","));
    expect(bodyOf(requestMock.mock.calls[1][1])).toMatchObject({ total: 250.2, currency: "RUB" });
    expect(bodyOf(requestMock.mock.calls[1][1]).marketing_consent_version).toBe(MARKETING_CONSENT_VERSION);
    expect(bodyOf(requestMock.mock.calls[2][1])).toEqual([
      { order: "order-1", product: productIds[0], sku_snapshot: "RE504836", title_snapshot: "Муфта компрессора John Deere", unit_price: 100.1, quantity: 2, currency: "RUB" },
      { order: "order-1", product: productIds[1], sku_snapshot: "RE504842", title_snapshot: "Ремень приводной", unit_price: 50, quantity: 1, currency: "RUB" },
    ]);
  });

  it.each([
    "10000000.29",
    "10000000.57",
    "10000000.99",
    "100000000.29",
    "100000000.57",
    "100000000.99",
    "1000000000.29",
    "1000000000.57",
    "1000000000.99",
  ])("accepts high valid decimal(12,2) price %s", async (price) => {
    requestMock.mockResolvedValueOnce([
      { ...products[0], price },
      products[1],
    ]);
    await createOrder(orderInput());

    expect(bodyOf(requestMock.mock.calls[2][1])[0].unit_price).toBe(Number(price));
  });

  it("accepts the maximum valid Directus decimal(12,2) price", async () => {
    requestMock.mockResolvedValueOnce([{ ...products[0], price: "9999999999.99" }]);
    await createOrder({
      ...orderInput(),
      items: [{ ...orderInput().items[0], quantity: 1 }],
    });

    expect(bodyOf(requestMock.mock.calls[1][1]).total).toBe(9_999_999_999.99);
  });

  it("rejects a missing product before creating any order", async () => {
    requestMock.mockResolvedValueOnce([products[0]]);
    await expect(createOrder(orderInput())).rejects.toBeInstanceOf(UnavailableOrderItemsError);
    expect(callsTo("/items/orders")).toHaveLength(0);
    expect(callsTo("/items/order_items")).toHaveLength(0);
  });

  it.each([
    { ...products[0], status: "draft" },
    { ...products[0], price_status: "on_request" },
    { ...products[0], price: null },
    { ...products[0], price: "not-a-price" },
    { ...products[0], price: -1 },
    { ...products[0], currency: "USD" },
  ])("rejects products without a published fixed RUB price before writes", async (invalidProduct) => {
    requestMock.mockResolvedValueOnce([invalidProduct, products[1]]);
    await expect(createOrder(orderInput())).rejects.toBeInstanceOf(UnavailableOrderItemsError);
    expect(callsTo("/items/orders")).toHaveLength(0);
  });

  it("propagates product read failures without attempting writes", async () => {
    requestMock.mockRejectedValueOnce(new Error("Directus unavailable"));
    await expect(createOrder(orderInput())).rejects.toThrow("Directus unavailable");
    expect(callsTo("/items/orders")).toHaveLength(0);
  });

  it("rejects a unit price that cannot be represented by Directus decimal(12,2) before writes", async () => {
    requestMock.mockResolvedValueOnce([
      { ...products[0], price: "10000000000.00" },
      products[1],
    ]);
    await expect(createOrder(orderInput())).rejects.toBeInstanceOf(OrderAmountOutOfRangeError);
    expect(callsTo("/items/orders")).toHaveLength(0);
    expect(callsTo("/items/order_items")).toHaveLength(0);
  });

  it("rejects an order total above Directus decimal(12,2) before writes", async () => {
    requestMock.mockResolvedValueOnce([
      { ...products[0], price: "1000000.00" },
    ]);
    await expect(createOrder({
      ...orderInput(),
      items: [
        { ...orderInput().items[0], quantity: 10_000 },
      ],
    })).rejects.toBeInstanceOf(OrderAmountOutOfRangeError);
    expect(callsTo("/items/orders")).toHaveLength(0);
    expect(callsTo("/items/order_items")).toHaveLength(0);
  });

  it("compensates when the line item batch fails, then rethrows", async () => {
    requestMock.mockImplementation(async (path, init) => {
      if (path.startsWith("/items/products?")) return products;
      if (path === "/items/orders" && init?.method === "POST") return { id: "order-1" };
      if (path === "/items/order_items") throw new Error("directus item write failed");
      return undefined;
    });
    await expect(createOrder(orderInput())).rejects.toThrow("directus item write failed");
    expect(requestMock).toHaveBeenCalledWith("/items/orders/order-1", expect.objectContaining({ method: "DELETE" }));
  });
});

describe("deleteOrder", () => {
  it("deletes the order by its encoded id", async () => {
    await deleteOrder("order/1");
    expect(requestMock).toHaveBeenCalledWith("/items/orders/order%2F1", expect.objectContaining({ method: "DELETE" }));
  });
});
