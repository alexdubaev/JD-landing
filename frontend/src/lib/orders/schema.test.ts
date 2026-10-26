import { describe, expect, it } from "vitest";

import { orderSchema } from "./schema";

const baseOrder = {
  name: "Иван",
  phone: "+7 900 000-00-00",
  email: "",
  page_url: "https://example.test/cart",
  items: [
    {
      product: "11111111-1111-4111-8111-111111111111",
      sku: "RE504836",
      title: "Фильтр",
      unit_price: 100,
      quantity: 1,
    },
  ],
  website: "",
};

describe("orderSchema", () => {
  it("accepts an explicit marketing consent value", () => {
    expect(orderSchema.parse({ ...baseOrder, marketing_consent: true }).marketing_consent).toBe(true);
  });

  it("defaults marketing consent to false", () => {
    expect(orderSchema.parse(baseOrder).marketing_consent).toBe(false);
  });

  it("requires a product ID for every cart line", () => {
    const result = orderSchema.safeParse({
      ...baseOrder,
      items: [{ ...baseOrder.items[0], product: undefined }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate product IDs so a line cannot bypass the quantity limit", () => {
    const result = orderSchema.safeParse({
      ...baseOrder,
      items: [baseOrder.items[0], { ...baseOrder.items[0], quantity: 1 }],
    });
    expect(result.success).toBe(false);
  });
});
