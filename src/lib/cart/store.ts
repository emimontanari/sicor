"use client";
import { useSyncExternalStore } from "react";
import {
  CART_STORAGE_KEY,
  EMPTY_CART,
  cartReducer,
  parseStoredCart,
  serializeCart,
  type CartAction,
  type CartState,
} from "./cart";

const LOCAL_EVENT = "sicor:cart";
let cachedRaw: string | null | undefined;
let cached: CartState = EMPTY_CART;

function read(): CartState {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(CART_STORAGE_KEY);
  } catch {
    return cached;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parseStoredCart(raw);
  }
  return cached;
}

function subscribe(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === CART_STORAGE_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(LOCAL_EVENT, cb);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(LOCAL_EVENT, cb);
  };
}

export function dispatchCart(action: CartAction): void {
  const next = cartReducer(read(), action);
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, serializeCart(next));
  } catch {
    cachedRaw = null;
    cached = next; // storage unavailable: keep in memory for this page
  }
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

export function useCart(): CartState {
  return useSyncExternalStore(subscribe, read, () => EMPTY_CART);
}
