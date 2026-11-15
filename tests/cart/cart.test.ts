import { describe, expect, it } from "vitest";
import {
  CART_STORAGE_KEY,
  cartCount,
  cartReducer,
  missingVariants,
  parseStoredCart,
  serializeCart,
  type CartState,
} from "../../src/lib/cart/cart";

const empty: CartState = { items: [], customerNote: "" };
const base = { code: "A1", name: "CAMISA", talle: "M", color: "Azul" };

describe("cartReducer", () => {
  it("merges same code+talle+color by adding quantities", () => {
    let s = cartReducer(empty, { type: "add", item: { ...base, quantity: 1 } });
    s = cartReducer(s, { type: "add", item: { ...base, quantity: 2 } });
    expect(s.items).toHaveLength(1);
    expect(s.items[0]!.quantity).toBe(3);
  });
  it("keeps different variants as separate lines", () => {
    let s = cartReducer(empty, { type: "add", item: { ...base, quantity: 1 } });
    s = cartReducer(s, { type: "add", item: { ...base, talle: "L", quantity: 1 } });
    s = cartReducer(s, { type: "add", item: { code: "A1", name: "CAMISA", quantity: 1 } });
    expect(s.items).toHaveLength(3);
    expect(cartCount(s)).toBe(3);
  });
  it("clamps quantity to at least 1 on add and setQuantity", () => {
    let s = cartReducer(empty, { type: "add", item: { ...base, quantity: 0 } });
    expect(s.items[0]!.quantity).toBe(1);
    s = cartReducer(s, { type: "setQuantity", key: "A1|M|Azul", quantity: -4 });
    expect(s.items[0]!.quantity).toBe(1);
    s = cartReducer(s, { type: "setQuantity", key: "A1|M|Azul", quantity: 5.7 });
    expect(s.items[0]!.quantity).toBe(5);
  });
  it("sets note, removes items, sets customer note, clears", () => {
    let s = cartReducer(empty, { type: "add", item: { ...base, quantity: 1 } });
    s = cartReducer(s, { type: "setNote", key: "A1|M|Azul", note: "urgente" });
    expect(s.items[0]!.note).toBe("urgente");
    s = cartReducer(s, { type: "setCustomerNote", note: "Juan" });
    expect(s.customerNote).toBe("Juan");
    s = cartReducer(s, { type: "remove", key: "A1|M|Azul" });
    expect(s.items).toEqual([]);
    s = cartReducer(s, { type: "add", item: { ...base, quantity: 1 } });
    expect(cartReducer(s, { type: "clear" })).toEqual(empty);
  });
});

describe("parseStoredCart", () => {
  it("round-trips a serialized cart", () => {
    const s = cartReducer(empty, { type: "add", item: { ...base, quantity: 2, note: "x" } });
    expect(parseStoredCart(serializeCart({ ...s, customerNote: "Ana" }))).toEqual({
      ...s,
      customerNote: "Ana",
    });
  });
  it("uses a versioned key", () => {
    expect(CART_STORAGE_KEY).toMatch(/v\d+$/);
  });
  it("returns empty for corrupt, old or foreign data", () => {
    for (const raw of [null, "", "{not json", "[]", "42", '{"v":0,"items":[]}', '{"v":1}', '"x"']) {
      expect(parseStoredCart(raw)).toEqual(empty);
    }
  });
  it("drops invalid items and sanitizes quantities", () => {
    const raw = JSON.stringify({
      v: 1,
      customerNote: 5,
      items: [
        { code: "A", name: "OK", quantity: 2 },
        { code: "", name: "no code", quantity: 1 },
        { code: "B", name: "bad qty", quantity: "x" },
        null,
        { code: "C", name: "neg", quantity: -3, talle: 7 },
      ],
    });
    const s = parseStoredCart(raw);
    expect(s.customerNote).toBe("");
    expect(s.items.map((i) => [i.code, i.quantity])).toEqual([
      ["A", 2],
      ["B", 1],
      ["C", 1],
    ]);
    expect(s.items[2]!.talle).toBeUndefined();
  });
});

describe("missingVariants", () => {
  it("requires talle/color only when the product offers them", () => {
    expect(missingVariants({ sizes: ["M"], colors: [] }, {})).toEqual(["talle"]);
    expect(missingVariants({ sizes: ["M"], colors: ["Rojo"] }, { talle: "M" })).toEqual(["color"]);
    expect(missingVariants({ sizes: [], colors: [] }, {})).toEqual([]);
    expect(missingVariants({ sizes: ["M"], colors: ["Rojo"] }, { talle: "M", color: "Rojo" })).toEqual([]);
  });
});
