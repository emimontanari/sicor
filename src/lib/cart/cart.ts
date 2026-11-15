/** Pure quote-cart logic (no DOM): reducer, storage parsing, variant validation. */

export const CART_STORAGE_KEY = "sicor.quote-cart.v1";
const CART_VERSION = 1;

export type CartItem = {
  code: string;
  name: string;
  talle?: string;
  color?: string;
  quantity: number;
  note?: string;
};
export type CartState = { items: CartItem[]; customerNote: string };

export type CartAction =
  | { type: "add"; item: CartItem }
  | { type: "setQuantity"; key: string; quantity: number }
  | { type: "setNote"; key: string; note: string }
  | { type: "setCustomerNote"; note: string }
  | { type: "remove"; key: string }
  | { type: "clear" };

export const EMPTY_CART: CartState = { items: [], customerNote: "" };

export function itemKey(i: Pick<CartItem, "code" | "talle" | "color">): string {
  return `${i.code}|${i.talle ?? ""}|${i.color ?? ""}`;
}

function clampQty(q: unknown): number {
  const n = typeof q === "number" && Number.isFinite(q) ? Math.floor(q) : 1;
  return Math.min(Math.max(n, 1), 9999);
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "add": {
      const incoming = { ...action.item, quantity: clampQty(action.item.quantity) };
      const target = itemKey(incoming);
      const exists = state.items.some((i) => itemKey(i) === target);
      const items = exists
        ? state.items.map((i) =>
            itemKey(i) === target ? { ...i, quantity: clampQty(i.quantity + incoming.quantity) } : i,
          )
        : [...state.items, incoming];
      return { ...state, items };
    }
    case "setQuantity": {
      const target = action.key;
      return {
        ...state,
        items: state.items.map((i) =>
          itemKey(i) === target ? { ...i, quantity: clampQty(action.quantity) } : i,
        ),
      };
    }
    case "setNote": {
      const target = action.key;
      return {
        ...state,
        items: state.items.map((i) => (itemKey(i) === target ? { ...i, note: action.note } : i)),
      };
    }
    case "setCustomerNote":
      return { ...state, customerNote: action.note };
    case "remove": {
      const target = action.key;
      return { ...state, items: state.items.filter((i) => itemKey(i) !== target) };
    }
    case "clear":
      return EMPTY_CART;
  }
}

export function cartCount(state: CartState): number {
  return state.items.reduce((n, i) => n + i.quantity, 0);
}

export function serializeCart(state: CartState): string {
  return JSON.stringify({ v: CART_VERSION, items: state.items, customerNote: state.customerNote });
}

const optStr = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v : undefined;

/** Tolerant parse: anything corrupt, old or foreign yields an empty cart. */
export function parseStoredCart(raw: string | null | undefined): CartState {
  if (!raw) return EMPTY_CART;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return EMPTY_CART;
    const d = data as Record<string, unknown>;
    if (d.v !== CART_VERSION || !Array.isArray(d.items)) return EMPTY_CART;
    const items: CartItem[] = [];
    for (const r of d.items) {
      if (!r || typeof r !== "object") continue;
      const o = r as Record<string, unknown>;
      if (typeof o.code !== "string" || o.code === "") continue;
      const item: CartItem = {
        code: o.code,
        name: typeof o.name === "string" && o.name ? o.name : o.code,
        quantity: clampQty(o.quantity),
      };
      const talle = optStr(o.talle);
      const color = optStr(o.color);
      const note = optStr(o.note);
      if (talle) item.talle = talle;
      if (color) item.color = color;
      if (note) item.note = note;
      items.push(item);
    }
    return { items, customerNote: typeof d.customerNote === "string" ? d.customerNote : "" };
  } catch {
    return EMPTY_CART;
  }
}

/** Variant dimensions the product offers but the user has not selected. */
export function missingVariants(
  product: { sizes: string[]; colors: string[] },
  selected: { talle?: string; color?: string },
): ("talle" | "color")[] {
  const out: ("talle" | "color")[] = [];
  if (product.sizes.length > 0 && !selected.talle) out.push("talle");
  if (product.colors.length > 0 && !selected.color) out.push("color");
  return out;
}
