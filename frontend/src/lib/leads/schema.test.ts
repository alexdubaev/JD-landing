import { describe, expect, it } from "vitest";

import { leadSchema } from "./schema";

describe("leadSchema", () => {
  it("normalizes a valid lead and keeps attribution data", () => {
    const result = leadSchema.parse({
      name: "  Иван  ",
      phone: "+7 900 000-00-00",
      email: "ivan@example.test",
      message: "Нужен подбор",
      page_url: "https://example.test/catalog",
      utm_source: "direct",
      website: "",
    });

    expect(result.name).toBe("Иван");
    expect(result.utm_source).toBe("direct");
  });

  it("rejects spam honeypot and malformed contacts", () => {
    expect(() =>
      leadSchema.parse({
        name: "Bot",
        phone: "1",
        email: "bad",
        website: "spam.example",
      }),
    ).toThrow();
  });
});
