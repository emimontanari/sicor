/** Pure navigation helpers for the product sheet / direct product page. */

/** Catalog URL a direct visitor of a product page returns to (its category, or the whole catalog). */
export function catalogReturnHref(categorySlug?: string | null): string {
  return categorySlug ? `/?categoria=${encodeURIComponent(categorySlug)}` : "/";
}

/**
 * How the product sheet closes. The sheet only mounts on a client-side navigation, so a history
 * entry normally exists and `back` restores the exact catalog URL and scroll. With no previous
 * entry (history length 1) there is nothing to go back to: fall back to the catalog home.
 */
export function closeAction(historyLength: number): "back" | "home" {
  return historyLength > 1 ? "back" : "home";
}

/** Pathname of a product detail route (`/producto/<code>`). */
export function isProductPath(pathname: string | null | undefined): boolean {
  return !!pathname && /^\/producto\/[^/]+\/?$/.test(pathname);
}

/**
 * The catalog filters come from the URL, but while a product sheet is open the URL is
 * `/producto/<code>` (no query). Keep showing the last catalog query so the list behind the
 * sheet does not reset (that would lose scroll and filters).
 */
export function effectiveQuery(pathname: string | null | undefined, live: string, frozen: string): string {
  return pathname === "/" || !isProductPath(pathname) ? live : frozen;
}
