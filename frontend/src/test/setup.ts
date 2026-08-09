import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import type { RenderOptions, RenderResult } from "@testing-library/react";
import { createElement, type ReactElement } from "react";
import { afterEach, vi } from "vitest";

import { CartProvider } from "@/lib/cart/context";

class TestIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0];

  disconnect() {}
  observe() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  unobserve() {}
}

globalThis.IntersectionObserver = TestIntersectionObserver;
globalThis.scrollTo = () => {};

/**
 * Wrap every test render in CartProvider so components using useCart
 * (ProductCard, Header, AddToCartButton, …) work without each test having to
 * add the provider boilerplate.
 */
vi.mock("@testing-library/react", async () => {
  const actual = await vi.importActual<
    typeof import("@testing-library/react")
  >("@testing-library/react");
  return {
    ...actual,
    render(
      ui: ReactElement,
      options?: RenderOptions,
    ): RenderResult {
      return actual.render(
        createElement(CartProvider, null, ui),
        options,
      );
    },
  };
});

afterEach(() => {
  cleanup();
});
