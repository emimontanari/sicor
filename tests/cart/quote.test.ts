import { describe, expect, it } from "vitest";
import { cartReducer, itemKey, type CartState } from "../../src/lib/cart/cart";
import { quoteSummary, resolveQuoteMedia, quoteMediaMap } from "../../src/lib/cart/quote";

const a = { code: "A", name: "Bota", quantity: 2, talle: "42", note: "Urgente" };
const b = { code: "B", name: "Guante", quantity: 1 };
describe("quote helpers", () => {
  it("projects only first image and brand; merges media without changing stored lines", () => {
    const media = quoteMediaMap([{ code: "A", images: ["/a.jpg", "/b.jpg"], brand: "Marca" }, { code: "B", images: [], brand: null }]);
    expect(media).toEqual({ A: { image: "/a.jpg", brand: "Marca" }, B: { image: null, brand: null } });
    expect(resolveQuoteMedia(a, media)).toEqual({ ...a, image: "/a.jpg", brand: "Marca" });
    expect(resolveQuoteMedia(b, media)).toEqual({ ...b, image: null, brand: null });
    expect(resolveQuoteMedia({ ...b, code: "old" }, media)).toEqual({ ...b, code: "old", image: null, brand: null });
    expect(a).not.toHaveProperty("image");
  });
  it("counts lines and units, including singular and empty", () => {
    expect(quoteSummary({ items: [a, b], customerNote: "" })).toBe("2 productos · 3 unidades");
    expect(quoteSummary({ items: [b], customerNote: "" })).toBe("1 producto · 1 unidad");
    expect(quoteSummary({ items: [], customerNote: "" })).toBe("0 productos · 0 unidades");
  });
  it("restores removed lines at their original position with notes, variants and customer note", () => {
    const state: CartState = { items: [a, b], customerNote: "Ana" };
    const removed = cartReducer(state, { type: "remove", key: itemKey(a) });
    expect(cartReducer(removed, { type: "restore", item: a, index: 0 })).toEqual(state);
    const decremented = cartReducer(state, { type: "decrement", key: itemKey(b) });
    expect(cartReducer(decremented, { type: "restore", item: b, index: 1 })).toEqual(state);
  });
  it("restore reuses add merging and quantity bounds without duplicate keys", () => {
    const state = { items: [a, b], customerNote: "Ana" };
    const restored = cartReducer(state, { type: "restore", item: { ...a, quantity: 99999 }, index: 0 });
    expect(restored.items).toEqual([{ ...a, quantity: 9999 }, b]);
    expect(state.items).toEqual([a, b]);
  });
});
