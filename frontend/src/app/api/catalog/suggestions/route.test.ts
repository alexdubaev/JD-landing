import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted once: the route delegates to the catalog adapter, which owns the
// Directus traffic (covered by catalog.test.ts). Here we test the HTTP shell.
const fetchProductSuggestions = vi.hoisted(() => vi.fn());
vi.mock("@/lib/directus/catalog", () => ({ fetchProductSuggestions }));

import { GET } from "./route";

const requestWith = (query: string) =>
  new Request(`https://example.test/api/catalog/suggestions?q=${encodeURIComponent(query)}`);

const suggestion = (id: string) => ({
  id,
  title: `Товар ${id}`,
  slug: `product-${id}`,
  sku: `SKU-${id}`,
  category: null,
  shortDescription: null,
  mainImageId: null,
  imageAlt: null,
  price: null,
  currency: "RUB",
  priceStatus: "on_request",
  availabilityStatus: "on_request",
});

beforeEach(() => {
  fetchProductSuggestions.mockReset();
});

describe("GET /api/catalog/suggestions", () => {
  it("validates q and returns suggestions on success", async () => {
    fetchProductSuggestions.mockResolvedValue([suggestion("p1")]);

    const response = await GET(requestWith(" re-504 836 "));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [suggestion("p1")] });
    expect(fetchProductSuggestions).toHaveBeenCalledTimes(1);
    expect(fetchProductSuggestions.mock.calls[0]).toEqual(["re-504 836", 6]);
  });

  it("accepts boundary lengths of 2 and 64 characters", async () => {
    fetchProductSuggestions.mockResolvedValue([]);

    expect((await GET(requestWith("ab"))).status).toBe(200);
    expect((await GET(requestWith("a".repeat(64)))).status).toBe(200);
    expect(fetchProductSuggestions).toHaveBeenCalledTimes(2);
  });

  it("returns an empty list without calling the adapter for invalid q", async () => {
    for (const query of ["", " ", "a", "a".repeat(65), "  ", "x".repeat(120)]) {
      const response = await GET(requestWith(query));
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ items: [] });
    }
    expect(fetchProductSuggestions).not.toHaveBeenCalled();
  });

  it("returns 503 with an empty list when the adapter fails", async () => {
    fetchProductSuggestions.mockRejectedValue(new Error("directus down"));

    const response = await GET(requestWith("RE504836"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ items: [] });
  });
});
