import { FILTER_BY_SLUG, FILTER_LABELS, FILTER_SLUGS, listHref, type FilterSlug, type ListState } from "./query";
import type { AdminFilter } from "../../../server/admin/products";

/** Pure helpers for the filter drawer, chips and nav highlight. URL query stays the source of truth. */

/** Single source for the "Estado" group: adding a slug to FILTER_SLUGS adds an option. */
export const ESTADO_OPTIONS: { slug: FilterSlug; label: string; countKey: AdminFilter }[] = FILTER_SLUGS.map((slug) => ({
  slug,
  label: FILTER_LABELS[slug],
  countKey: FILTER_BY_SLUG[slug],
}));

export type CategoryRef = { slug: string; name: string };
export type FilterChip = { key: "filtro" | "categoria" | "q"; label: string; href: string };

/** Drawer filters only (estado, categoría); the search box is not a drawer filter. */
export function activeFilterCount(state: ListState): number {
  return (state.filtro !== "todos" ? 1 : 0) + (state.categoria ? 1 : 0);
}

export function filterChips(state: ListState, categories: CategoryRef[]): FilterChip[] {
  const chips: FilterChip[] = [];
  if (state.filtro !== "todos") {
    chips.push({ key: "filtro", label: FILTER_LABELS[state.filtro], href: listHref(state, { filtro: "todos" }) });
  }
  if (state.categoria) {
    const name = categories.find((c) => c.slug === state.categoria)?.name ?? state.categoria;
    chips.push({ key: "categoria", label: name, href: listHref(state, { categoria: undefined }) });
  }
  if (state.q) chips.push({ key: "q", label: `“${state.q}”`, href: listHref(state, { q: "" }) });
  return chips;
}

export function clearFiltersHref(state: ListState): string {
  return listHref(state, { filtro: "todos", categoria: undefined });
}

export function optionHref(state: ListState, change: { filtro?: FilterSlug; categoria?: string | undefined }): string {
  return listHref(state, change);
}

/** Section is current when its path matches; Productos vs Nuevos is told apart by ?filtro=nuevos. */
export function isNavCurrent(link: { href: string }, pathname: string, params: URLSearchParams): boolean {
  const [path, query = ""] = link.href.split("?");
  if (pathname !== path && !pathname.startsWith(`${path}/`)) return false;
  const wantsNuevos = new URLSearchParams(query).get("filtro") === "nuevos";
  if (path !== "/admin/productos") return true;
  return wantsNuevos ? params.get("filtro") === "nuevos" : params.get("filtro") !== "nuevos";
}
