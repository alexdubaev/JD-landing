import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { usePartsRequestDraft as UsePartsRequestDraft } from "./use-parts-request-draft";

const DRAFT_KEY = "deere-shop:parts-request-draft";
const LIST_KEY = "deere-shop:product-request-list";
const GENERATED_KEY = "deere-shop:parts-request-generated-product-lines";
const LIST_EVENT = "deere-shop:product-request-list-change";

type DraftApi = ReturnType<typeof UsePartsRequestDraft>;

/**
 * Renders the hook through a probe component with a freshly imported module
 * (vi.resetModules in beforeEach simulates a page load with a clean store,
 * same approach as the cart store tests) and records every draft value
 * observed during render phases plus the latest hook API.
 */
async function renderProbe() {
  const seen: string[] = [];
  const api: DraftApi[] = [];
  const mod = await import("./use-parts-request-draft");
  function Probe() {
    const hook = mod.usePartsRequestDraft();
    seen.push(hook.draft);
    api.push(hook);
    return null;
  }
  render(<Probe />);
  return { seen, latest: () => api.at(-1)! };
}

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("usePartsRequestDraft", () => {
  it("renders an empty draft on the first render even when storage holds data", async () => {
    localStorage.setItem(DRAFT_KEY, "RE504836 — 2 шт.");

    const { seen } = await renderProbe();

    // The hydration contract: the hydration render uses the "" server
    // snapshot, so server markup and the first client render match exactly.
    expect(seen[0]).toBe("");
    // The first subscription then seeds the persisted value.
    expect(seen.at(-1)).toBe("RE504836 — 2 шт.");
  });

  it("persists every draft change immediately and removes the key when emptied", async () => {
    const { latest } = await renderProbe();

    act(() => latest().setDraft("RE504836 — 1 шт."));
    expect(latest().draft).toBe("RE504836 — 1 шт.");
    expect(localStorage.getItem(DRAFT_KEY)).toBe("RE504836 — 1 шт.");

    act(() => latest().setDraft(""));
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("seeds generated lines from the saved product selection list", async () => {
    localStorage.setItem(
      LIST_KEY,
      JSON.stringify([{ id: "product-1", sku: "RE123456", title: "Фильтр" }]),
    );

    const { seen } = await renderProbe();

    expect(seen.at(-1)).toBe("RE123456 — 1 шт.");
    expect(localStorage.getItem(GENERATED_KEY)).toContain("RE123456");
  });

  it("reconciles the draft when the product selection list changes", async () => {
    localStorage.setItem(DRAFT_KEY, "MANUAL-1 — 1 шт.");
    const { seen } = await renderProbe();

    localStorage.setItem(DRAFT_KEY, "MANUAL-1 — 1 шт.\nRE123456 — 1 шт.");
    localStorage.setItem(GENERATED_KEY, JSON.stringify([]));
    localStorage.setItem(
      LIST_KEY,
      JSON.stringify([{ id: "product-1", sku: "RE123456", title: "Фильтр" }]),
    );
    act(() => {
      window.dispatchEvent(new Event(LIST_EVENT));
    });

    expect(seen.at(-1)).toBe("MANUAL-1 — 1 шт.\nRE123456 — 1 шт.");
  });

  it("clear() wipes the draft, generated lines and the selection list", async () => {
    localStorage.setItem(DRAFT_KEY, "RE123456 — 1 шт.");
    localStorage.setItem(
      LIST_KEY,
      JSON.stringify([{ id: "product-1", sku: "RE123456", title: "Фильтр" }]),
    );
    const { latest } = await renderProbe();

    act(() => latest().clear());

    expect(latest().draft).toBe("");
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(localStorage.getItem(LIST_KEY)).toBe("[]");
    expect(JSON.parse(localStorage.getItem(GENERATED_KEY) ?? "[]")).toEqual([]);
  });
});
