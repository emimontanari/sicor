import type { AdminFilter, BulkPatch, OverridePatch } from "../../../server/admin/products";

/** Pure helpers for the products admin UI: query-string state and form parsing. */

export const FILTER_SLUGS = ["todos", "visibles", "ocultos", "nuevos", "discontinuados", "eliminados"] as const;
export type FilterSlug = (typeof FILTER_SLUGS)[number];

export const FILTER_BY_SLUG: Record<FilterSlug, AdminFilter> = {
  todos: "all",
  visibles: "visible",
  ocultos: "hidden",
  nuevos: "nuevos",
  discontinuados: "discontinued",
  eliminados: "eliminados",
};
export const FILTER_LABELS: Record<FilterSlug, string> = {
  todos: "Todos",
  visibles: "Visibles",
  ocultos: "Ocultos",
  nuevos: "Nuevos para revisar",
  discontinuados: "Discontinuados",
  eliminados: "Eliminados",
};

export const LIST_PATH = "/admin/productos";
export const PAGE_SIZE = 25;
const MAX_QUERY = 100;

export type ListState = {
  filtro: FilterSlug;
  filter: AdminFilter;
  categoria: string | undefined;
  q: string;
  page: number;
};
type Raw = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseListQuery(sp: Raw): ListState {
  const rawFiltro = first(sp.filtro) ?? "";
  const filtro: FilterSlug = (FILTER_SLUGS as readonly string[]).includes(rawFiltro) ? (rawFiltro as FilterSlug) : "todos";
  const page = Number.parseInt(first(sp.page) ?? "", 10);
  return {
    filtro,
    filter: FILTER_BY_SLUG[filtro],
    categoria: first(sp.categoria)?.trim() || undefined,
    q: (first(sp.q) ?? "").trim().slice(0, MAX_QUERY),
    page: Number.isFinite(page) && page >= 1 ? page : 1,
  };
}

/** Builds a list URL from the current state plus changes; changing filtro/categoria/q resets the page. */
export function listHref(
  state: ListState,
  change: { filtro?: FilterSlug; categoria?: string | undefined; q?: string; page?: number },
): string {
  const next = { ...state, ...change };
  if (!("page" in change) && ("filtro" in change || "categoria" in change || "q" in change)) next.page = 1;
  const p = new URLSearchParams();
  if (next.filtro !== "todos") p.set("filtro", next.filtro);
  if (next.categoria) p.set("categoria", next.categoria);
  if (next.q) p.set("q", next.q);
  if (next.page > 1) p.set("page", String(next.page));
  const s = p.toString();
  return s ? `${LIST_PATH}?${s}` : LIST_PATH;
}

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

/** Edit form → OverridePatch. Invalid values are passed through so the data layer reports field errors. */
export function parseProductForm(fd: FormData): OverridePatch {
  const empty = (k: string) => (str(fd, k).trim() === "" ? null : str(fd, k));
  const vis = str(fd, "visible");
  const cat = str(fd, "categoryId").trim();
  return {
    customName: empty("customName"),
    customDescription: empty("customDescription"),
    customPrice: empty("customPrice"),
    showPrice: fd.get("showPrice") === "on",
    visible: vis === "true" ? true : vis === "false" ? false : null,
    categoryId: (cat === "" ? null : /^\d+$/.test(cat) ? Number(cat) : cat) as number | null,
  };
}

export type BulkParse = { ok: true; codes: string[]; patch: BulkPatch } | { ok: false; error: string };

export function parseBulkForm(fd: FormData): BulkParse {
  const codes = [...new Set(fd.getAll("code").filter((c): c is string => typeof c === "string" && c !== ""))];
  if (codes.length === 0) return { ok: false, error: "Seleccioná al menos un producto" };
  switch (str(fd, "intent")) {
    case "show":
      return { ok: true, codes, patch: { visible: true } };
    case "hide":
      return { ok: true, codes, patch: { visible: false } };
    case "reviewed":
      return { ok: true, codes, patch: { reviewed: true } };
    case "category": {
      const v = str(fd, "bulkCategory");
      if (v === "none") return { ok: true, codes, patch: { categoryId: null } };
      if (/^\d+$/.test(v)) return { ok: true, codes, patch: { categoryId: Number(v) } };
      return { ok: false, error: "Elegí una categoría" };
    }
    default:
      return { ok: false, error: "Acción inválida" };
  }
}
