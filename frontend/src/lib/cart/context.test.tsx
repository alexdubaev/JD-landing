import { act, cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CartLine, ProductCardData } from "@/types/catalog";

import { getServerSnapshot } from "./context";

/**
 * The cart store lives in module-level state, so every test re-imports the
 * module (vi.resetModules) to simulate a fresh page load with a clean store.
 * The probe renders inside an explicitly created CartProvider of that fresh
 * module instance; the global test render wrapper (see src/test/setup.ts)
 * adds an outer provider of an unrelated instance, which the probe never sees.
 */
type CartApi = {
  hydrated: boolean;
  lines: CartLine[];
  count: number;
  total: number;
  addToCart: (product: ProductCardData, quantity?: number) => void;
  setQuantity: (id: string, quantity: number) => void;
};

type CartModule = typeof import("./context");

async function loadCartModule(): Promise<CartModule> {
  return import("./context");
}

function makeProbe(useCart: () => CartApi) {
  return function CartProbe({ onCart }: { onCart: (cart: CartApi) => void }) {
    onCart(useCart());
    return null;
  };
}

function fixture(overrides: Partial<ProductCardData> = {}): ProductCardData {
  return {
    id: "p1",
    title: "Фильтр John Deere RE504836",
    slug: "john-deere-re504836",
    sku: "RE504836",
    category: { id: "c1", title: "Фильтры", slug: "filtry" },
    shortDescription: null,
    mainImageId: null,
    imageAlt: null,
    price: 1500,
    currency: "RUB",
    priceStatus: "fixed",
    availabilityStatus: "in_stock",
    ...overrides,
  };
}

function persistedLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    id: "p1",
    slug: "john-deere-re504836",
    href: "/catalog/filtry/john-deere-re504836",
    title: "Фильтр John Deere RE504836",
    sku: "RE504836",
    unitPrice: 1500,
    currency: "RUB",
    quantity: 2,
    mainImageId: null,
    imageAlt: null,
    ...overrides,
  };
}

const STORAGE_KEY = "deere-shop:cart";

async function renderProbe() {
  const mod = await loadCartModule();
  const Probe = makeProbe((mod.useCart as () => CartApi));
  let current: CartApi | null = null;
  const onCart = (cart: CartApi) => {
    current = cart;
  };
  render(createElement(mod.CartProvider, null, createElement(Probe, { onCart })));
  if (!current) throw new Error("probe did not render");
  return { mod, cart: () => current as CartApi };
}

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

afterEach(() => {
  cleanup();
});

describe("CartProvider", () => {
  it("returns the same server snapshot reference on every call", () => {
    expect(getServerSnapshot()).toBe(getServerSnapshot());
  });

  it("restores the persisted cart on mount without any user action", async () => {
    const line = persistedLine();
    localStorage.setItem(STORAGE_KEY, JSON.stringify([line]));

    const { cart } = await renderProbe();

    expect(cart().lines).toEqual([line]);
    expect(cart().count).toBe(2);
    expect(cart().total).toBe(3000);
  });

  it("hydrated is false during the first render and true after mount", async () => {
    const snapshots: boolean[] = [];
    const mod = await loadCartModule();
    const Probe = makeProbe((mod.useCart as () => CartApi));
    render(
      createElement(
        mod.CartProvider,
        null,
        createElement(Probe, {
          onCart: (c) => snapshots.push(c.hydrated),
        }),
      ),
    );
    // The effect-driven flip produced a second render by now.
    expect(snapshots[0]).toBe(false);
    expect(snapshots[snapshots.length - 1]).toBe(true);
  });

  it("merges quantity when the same product is added twice", async () => {
    const { cart } = await renderProbe();

    await act(async () => {
      cart().addToCart(fixture());
      cart().addToCart(fixture());
    });

    expect(cart().lines).toHaveLength(1);
    expect(cart().lines[0]?.quantity).toBe(2);
    expect(cart().count).toBe(2);
  });

  it("caps quantity at 10000 and removes the line at zero", async () => {
    const { cart } = await renderProbe();

    await act(async () => {
      cart().addToCart(fixture());
    });
    await act(async () => {
      cart().setQuantity("p1", 20_000);
    });
    expect(cart().lines[0]?.quantity).toBe(10_000);

    await act(async () => {
      cart().setQuantity("p1", 0);
    });
    expect(cart().lines).toHaveLength(0);
  });

  it("persists added lines to localStorage", async () => {
    const { cart } = await renderProbe();

    await act(async () => {
      cart().addToCart(fixture());
    });

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as CartLine[];
    expect(stored).toHaveLength(1);
    expect(stored[0]?.id).toBe("p1");
    expect(stored[0]?.quantity).toBe(1);
  });

  it("syncs state from localStorage on a cross-tab storage event", async () => {
    const { cart } = await renderProbe();
    expect(cart().lines).toHaveLength(0);

    const external = persistedLine({ id: "p2", slug: "other", quantity: 3, unitPrice: 100 });
    localStorage.setItem(STORAGE_KEY, JSON.stringify([external]));

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: STORAGE_KEY, storageArea: localStorage }),
      );
    });

    expect(cart().lines).toEqual([external]);
    expect(cart().count).toBe(3);
  });

  it("drops invalid persisted lines and keeps the valid ones", async () => {
    const valid = persistedLine({ id: "ok" });
    const invalidPrice = { ...persistedLine({ id: "bad-price" }), unitPrice: "1500" };
    const invalidQuantity = { ...persistedLine({ id: "bad-qty" }), quantity: -2 };
    const missingTitle = { ...persistedLine({ id: "bad-title" }), title: 42 };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([valid, invalidPrice, invalidQuantity, missingTitle]),
    );

    const { cart } = await renderProbe();

    expect(cart().lines).toEqual([valid]);
    expect(cart().total).toBe(3000);
    expect(Number.isFinite(cart().total)).toBe(true);
  });
});
