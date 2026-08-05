"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { CartLine, ProductCardData } from "@/types/catalog";

const STORAGE_KEY = "deere-shop:cart";
const EVENT_NAME = "deere-shop:cart-change";
const QUANTITY_MAX = 10_000;

type CartState = CartLine[];

type CartAction =
  | { type: "add"; product: CartLine; quantity: number }
  | { type: "setQuantity"; id: string; quantity: number }
  | { type: "remove"; id: string }
  | { type: "clear" };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "add": {
      const existing = state.find((line) => line.id === action.product.id);
      if (existing) {
        const nextQty = Math.min(
          existing.quantity + action.quantity,
          QUANTITY_MAX,
        );
        return state.map((line) =>
          line.id === action.product.id ? { ...line, quantity: nextQty } : line,
        );
      }
      return [...state, { ...action.product, quantity: action.quantity }];
    }
    case "setQuantity": {
      if (action.quantity <= 0) {
        return state.filter((line) => line.id !== action.id);
      }
      return state.map((line) =>
        line.id === action.id
          ? { ...line, quantity: Math.min(action.quantity, QUANTITY_MAX) }
          : line,
      );
    }
    case "remove":
      return state.filter((line) => line.id !== action.id);
    case "clear":
      return [];
    default:
      return state;
  }
}

function isPurchasable(product: ProductCardData): boolean {
  return product.priceStatus === "fixed" && typeof product.price === "number";
}

function toCartLine(product: ProductCardData): CartLine {
  const href = product.category
    ? `/catalog/${product.category.slug}/${product.slug}`
    : `/catalog`;
  return {
    id: product.id,
    slug: product.slug,
    href,
    title: product.title,
    sku: product.sku,
    unitPrice: product.price ?? 0,
    currency: product.currency,
    quantity: 1,
    mainImageId: product.mainImageId,
    imageAlt: product.imageAlt,
  };
}

/**
 * localStorage-backed cart store exposed through useSyncExternalStore.
 *
 * The store keeps a single source of truth in localStorage (so multiple tabs
 * and the header badge stay in sync) and notifies React subscribers on every
 * mutation via a CustomEvent. The empty array returned during SSR is replaced
 * by the real persisted contents once the client reads localStorage.
 */
function readStore(): CartState {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CartLine[]) : [];
  } catch {
    return [];
  }
}

function writeStore(lines: CartState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Storage may be unavailable (private mode / quota); fail silently.
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => callback();
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
}

// Module-level mutable state: the live cart. Mutated only through dispatch,
// which writes through to localStorage and broadcasts the change event.
let currentState: CartState = [];

function getState(): CartState {
  return currentState;
}

function dispatch(action: CartAction): void {
  currentState = cartReducer(currentState, action);
  writeStore(currentState);
}

// Lazy-init from localStorage on first client access.
function ensureInitialized(): void {
  if (typeof window !== "undefined" && currentState.length === 0) {
    // Only seed if storage actually has data; otherwise keep the empty default
    // so a freshly-cleared cart is not refilled from a stale empty string.
    const stored = readStore();
    if (stored.length > 0) currentState = stored;
  }
}

type CartContextValue = {
  hydrated: boolean;
  lines: CartLine[];
  count: number;
  total: number;
  has: (id: string) => boolean;
  quantityOf: (id: string) => number;
  addToCart: (product: ProductCardData, quantity?: number) => void;
  setQuantity: (id: string, quantity: number) => void;
  increment: (id: string) => void;
  decrement: (id: string) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const isClient = typeof window !== "undefined";
  const lines = useSyncExternalStore(
    subscribe,
    isClient ? getState : () => [],
    () => [],
  );

  const addToCart = useCallback(
    (product: ProductCardData, quantity = 1) => {
      ensureInitialized();
      if (!isPurchasable(product)) return;
      dispatch({ type: "add", product: toCartLine(product), quantity });
    },
    [],
  );

  const setQuantity = useCallback((id: string, quantity: number) => {
    ensureInitialized();
    dispatch({ type: "setQuantity", id, quantity });
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const count = lines.reduce((sum, line) => sum + line.quantity, 0);
    const total = lines.reduce(
      (sum, line) => sum + line.unitPrice * line.quantity,
      0,
    );
    return {
      hydrated: isClient,
      lines,
      count,
      total,
      has: (id) => lines.some((line) => line.id === id),
      quantityOf: (id) =>
        lines.find((line) => line.id === id)?.quantity ?? 0,
      addToCart,
      setQuantity,
      increment: (id) => {
        ensureInitialized();
        const current =
          currentState.find((line) => line.id === id)?.quantity ?? 0;
        dispatch({ type: "setQuantity", id, quantity: current + 1 });
      },
      decrement: (id) => {
        ensureInitialized();
        const current =
          currentState.find((line) => line.id === id)?.quantity ?? 0;
        dispatch({ type: "setQuantity", id, quantity: current - 1 });
      },
      removeFromCart: (id) => {
        ensureInitialized();
        dispatch({ type: "remove", id });
      },
      clearCart: () => {
        ensureInitialized();
        dispatch({ type: "clear" });
      },
    };
  }, [lines, isClient, addToCart, setQuantity]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return ctx;
}

export { isPurchasable };
export const CART_STORAGE_KEY = STORAGE_KEY;
export const CART_CHANGE_EVENT = EVENT_NAME;
