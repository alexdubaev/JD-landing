import { describe, expect, it } from "vitest";

import {
  AVAILABILITY_FILTERS,
  AVAILABILITY_LABELS,
  PART_TYPE_FILTERS,
  PRICE_FILTERS,
} from "./catalog-labels";
import { formatRuDate } from "./date";
import { formatPrice, formatProductPrice } from "./price";
import { telHref } from "./tel";

describe("formatProductPrice", () => {
  it("keeps the exact wording for non-fixed prices", () => {
    expect(
      formatProductPrice({ price: null, priceStatus: "on_request", currency: "RUB" }),
    ).toBe("Цена по запросу");
    expect(
      formatProductPrice({ price: null, priceStatus: "hidden", currency: "RUB" }),
    ).toBe("Уточнить условия");
    expect(
      formatProductPrice({ price: null, priceStatus: "fixed", currency: "RUB" }),
    ).toBe("Уточнить условия");
  });

  it("formats a fixed price in the product currency", () => {
    expect(
      formatProductPrice({ price: 1500, priceStatus: "fixed", currency: "RUB" }),
    ).toBe(formatPrice(1500, "RUB"));
  });
});

describe("catalog labels", () => {
  it("covers every availability status", () => {
    expect(Object.keys(AVAILABILITY_LABELS).sort()).toEqual([
      "in_stock",
      "on_request",
      "out_of_stock",
    ]);
    expect(AVAILABILITY_LABELS.in_stock).toBe("В наличии");
  });

  it("gives every filter value both an option and a chip label", () => {
    for (const group of [AVAILABILITY_FILTERS, PRICE_FILTERS, PART_TYPE_FILTERS]) {
      for (const option of group) {
        expect(option.value).not.toBe("");
        expect(option.optionLabel.length).toBeGreaterThan(0);
        expect(option.chipLabel.length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the price chip wording with context, select wording short", () => {
    expect(PRICE_FILTERS[0]).toMatchObject({
      value: "fixed",
      optionLabel: "Указана",
      chipLabel: "Цена указана",
    });
  });
});

describe("telHref", () => {
  it("keeps only digits and the leading plus", () => {
    expect(telHref("+7 (495) 123-45-67")).toBe("+74951234567");
    expect(telHref("88005553535")).toBe("88005553535");
  });
});

describe("formatRuDate", () => {
  it("formats a long Russian date from an ISO string", () => {
    expect(formatRuDate("2026-08-17T00:00:00.000Z")).toMatch(
      /^1[67] августа 2026/u,
    );
  });
});
