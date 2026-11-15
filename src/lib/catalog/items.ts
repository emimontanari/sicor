import type { CatalogProduct } from "../../server/catalog/read";
import type { CatalogItem } from "./filters";

export const UNCATEGORISED = "otros";

/** Slim, serializable projection of a product for the single-page list (keeps the RSC payload small). */
export function toCatalogItem(p: CatalogProduct): CatalogItem {
  const ficha = p.documents.find((d) => d.kind === "ficha");
  return {
    code: p.code,
    name: p.name,
    brand: p.brand,
    category: p.category?.slug ?? UNCATEGORISED,
    image: p.images[0] ?? null,
    variants: p.sizes.length > 0 || p.colors.length > 0,
    price: p.price,
    hasFicha: p.hasFicha,
    ...(ficha ? { fichaUrl: ficha.url } : {}),
  };
}
