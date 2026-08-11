import { describe, expect, it } from "vitest";

import { createOrderSchema } from "./schema";

describe("order schema", () => {
  it("requires a Turnstile token in production", () => {
    const result = createOrderSchema("production").safeParse({
      name: "РРІР°РЅ",
      phone: "+7 900 000-00-00",
      website: "",
      items: [{ sku: "RE504836", title: "Р¤РёР»СЊС‚СЂ", unit_price: 1, quantity: 1 }],
    });

    expect(result.success).toBe(false);
  });
});
