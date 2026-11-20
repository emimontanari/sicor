import { cartCount, type CartItem, type CartState } from "./cart";

export type QuoteMedia = { image: string | null; brand: string | null };
export type QuoteMediaMap = Record<string, QuoteMedia>;

/** Project the visible server catalog, never persist presentation data in localStorage. */
export function quoteMediaMap(products: { code: string; images: string[]; brand: string | null }[]): QuoteMediaMap {
  return Object.fromEntries(products.map((p) => [p.code, { image: p.images[0] ?? null, brand: p.brand }]));
}

export function resolveQuoteMedia(item: CartItem, media: QuoteMediaMap): CartItem & QuoteMedia {
  return { ...item, ...(Object.hasOwn(media, item.code) ? media[item.code] : { image: null, brand: null }) };
}

export function quoteSummary(cart: CartState): string {
  const products = cart.items.length;
  const units = cartCount(cart);
  return `${products} ${products === 1 ? "producto" : "productos"} · ${units} ${units === 1 ? "unidad" : "unidades"}`;
}
