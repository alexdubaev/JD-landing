"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  clearGeneratedProductRequestLines,
  PRODUCT_REQUEST_LIST_EVENT,
  reconcileProductRequestDraft,
  setProductRequestList,
} from "./product-request-list";

const STORAGE_KEY = "deere-shop:parts-request-draft";
const DRAFT_CHANGE_EVENT = "deere-shop:parts-request-draft-change";

/**
 * Draft state of the bulk parts-request form, exposed through
 * useSyncExternalStore with a "" server snapshot: the hydration render always
 * matches the server markup, and the persisted draft replaces it right after
 * the first subscription (same store pattern as the cart).
 *
 * Persistence keeps the historical contract: every change is written through
 * to localStorage immediately (no debounce). Synchronization with the product
 * selection list rides the existing CustomEvent.
 */

// Module-level mutable state: the live draft. Seeded from localStorage when
// the first subscriber attaches; mutated only through the hook API, which
// writes through to storage and broadcasts the change event.
let currentDraft = "";
let storeInitialized = false;

function seedFromStorage(): string {
  try {
    return reconcileProductRequestDraft(
      localStorage.getItem(STORAGE_KEY) ?? "",
    );
  } catch {
    return "";
  }
}

function subscribe(callback: () => void): () => void {
  const onDraftChange = () => callback();
  const onSelectionChange = () => {
    currentDraft = reconcileProductRequestDraft(currentDraft);
    callback();
  };
  window.addEventListener(DRAFT_CHANGE_EVENT, onDraftChange);
  window.addEventListener(PRODUCT_REQUEST_LIST_EVENT, onSelectionChange);
  const firstSubscriber = !storeInitialized;
  if (firstSubscriber) {
    storeInitialized = true;
    currentDraft = seedFromStorage();
  }
  if (firstSubscriber) callback();
  return () => {
    window.removeEventListener(DRAFT_CHANGE_EVENT, onDraftChange);
    window.removeEventListener(PRODUCT_REQUEST_LIST_EVENT, onSelectionChange);
  };
}

function getDraft(): string {
  return currentDraft;
}

function getServerDraft(): string {
  return "";
}

export function usePartsRequestDraft() {
  const draft = useSyncExternalStore(subscribe, getDraft, getServerDraft);

  const setDraft = useCallback((value: string) => {
    currentDraft = value;
    if (value) localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(DRAFT_CHANGE_EVENT));
  }, []);

  const clear = useCallback(() => {
    currentDraft = "";
    localStorage.removeItem(STORAGE_KEY);
    clearGeneratedProductRequestLines();
    // Empties the selection list and dispatches its change event, which the
    // store subscription above receives and reconciles into the same "".
    setProductRequestList([]);
    window.dispatchEvent(new Event(DRAFT_CHANGE_EVENT));
  }, []);

  return { draft, setDraft, clear };
}
