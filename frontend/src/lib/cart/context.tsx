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
const EMPTY_CART: CartState = [];

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
 * The store seeds its module-level state from localStorage when the first
 * subscriber attaches (so a page reload shows the persisted cart without any
 * user action) and stays in sync across tabs by re-reading storage on the
 * `storage` event. Mutations notify React subscribers via a CustomEvent. The
 * empty array returned during SSR is replaced by the real persisted contents
 * once the client subscribes.
 */
function isValidCartLine(value: unknown): value is CartLine {
  if (typeof value !== "object" || value === null) return false;
  const line = value as Record<string, unknown>;
  return (
    typeof line.id === "string" &&
    line.id !== "" &&
    typeof line.slug === "string" &&
    typeof line.href === "string" &&
    typeof line.title === "string" &&
    Number.isFinite(line.unitPrice) &&
    (line.unitPrice as number) >= 0 &&
    Number.isInteger(line.quantity) &&
    (line.quantity as number) >= 1 &&
    (line.quantity as number) <= QUANTITY_MAX
  );
}

function readStore(): CartState {
  if (typeof window === "undefined") return EMPTY_CART;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_CART;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return EMPTY_CART;
    const lines = parsed.filter(isValidCartLine);
    if (lines.length !== parsed.length) {
      console.warn(
        `[cart] dropped ${parsed.length - lines.length} invalid persisted line(s)`,
      );
    }
    return lines;
  } catch {
    return EMPTY_CART;
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
  const onStorage = (event: StorageEvent) => {
    // `key === null` means localStorage.clear() in another tab.
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    currentState = readStore();
    callback();
  };
  const seeded = ensureInitialized();
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", onStorage);
  if (seeded) callback();
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", onStorage);
  };
}

// Module-level mutable state: the live cart. Mutated only through dispatch,
// which writes through to localStorage and broadcasts the change event.
let currentState: CartState = EMPTY_CART;
let storeInitialized = false;

function getState(): CartState {
  return currentState;
}

// True once the store has checked localStorage (first subscription); false
// during SSR, the hydration render and any pre-mount render. Unlike a
// `typeof window` check, it never claims "hydrated" before the persisted
// cart has actually been seeded.
function getHydrated(): boolean {
  return storeInitialized;
}

function getHydratedServer(): boolean {
  return false;
}

// React calls this during SSR and hydration. It must return a stable reference
// rather than creating a new empty array for every call.
export function getServerSnapshot(): CartState {
  return EMPTY_CART;
}

function dispatch(action: CartAction): void {
  currentState = cartReducer(currentState, action);
  writeStore(currentState);
}

// Lazy-init from localStorage before the first subscriber reads the store.
// Idempotent (guarded by storeInitialized) so StrictMode double-subscribes and
// repeated calls from action handlers are safe. Returns true when the first
// call changed the snapshot, so `subscribe` can notify React immediately.
function ensureInitialized(): boolean {
  if (storeInitialized || typeof window === "undefined") return false;
  storeInitialized = true;
  // Only seed if storage actually has data; otherwise keep the empty default
  // so a freshly-cleared cart is not refilled from a stale empty string.
  const stored = readStore();
  if (stored.length > 0) {
    currentState = stored;
    return true;
  }
  return false;
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
  const lines = useSyncExternalStore(
    subscribe,
    getState,
    getServerSnapshot,
  );
  // Reusing `subscribe` is enough: after subscribing, React re-reads the
  // snapshot, which flips from false to true once the store initialized.
  const hydrated = useSyncExternalStore(subscribe, getHydrated, getHydratedServer);

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
      hydrated,
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
  }, [lines, hydrated, addToCart, setQuantity]);

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
