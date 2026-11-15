/** Pure catalog filter logic: URL <-> state, filtering and facets. No DOM, no server imports. */

export type CatalogItem = {
  code: string;
  name: string;
  brand: string | null;
  /** Category slug ("otros" when uncategorised). */
  category: string;
  image: string | null;
  /** True when the product has talle/color options: quick-add must go through the product page. */
  variants: boolean;
  price: string | null;
  /** True when the product has a ficha técnica PDF. */
  hasFicha: boolean;
  /** App URL of the ficha técnica PDF; present only when `hasFicha`. */
  fichaUrl?: string;
};

export type CatalogFilter = {
  categories: string[];
  brands: string[];
  q: string;
  /** Only products with a ficha técnica (`?ficha=1`). */
  ficha: boolean;
};
export const EMPTY_FILTER: CatalogFilter = { categories: [], brands: [], q: "", ficha: false };
export const MAX_QUERY = 100;

export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function all(src: ParamSource, key: string): string[] {
  if (src instanceof URLSearchParams) return src.getAll(key);
  const v = src[key];
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

const uniqueTrimmed = (xs: string[]): string[] => [
  ...new Set(xs.map((x) => x.trim()).filter(Boolean)),
];

/** `?categoria=a&categoria=b&marca=OMBU&q=guante` -> filter state (repeated keys = multi-select). */
export function parseFilter(src: ParamSource): CatalogFilter {
  return {
    categories: uniqueTrimmed(all(src, "categoria")),
    brands: uniqueTrimmed(all(src, "marca")),
    q: (all(src, "q")[0] ?? "").trim().slice(0, MAX_QUERY).trim(),
    ficha: all(src, "ficha")[0]?.trim() === "1",
  };
}

/** Filter state -> query string without "?" (stable order; "" when no filter is active). */
export function serializeFilter(f: CatalogFilter): string {
  const p = new URLSearchParams();
  for (const c of f.categories) p.append("categoria", c);
  for (const b of f.brands) p.append("marca", b);
  const q = f.q.trim().slice(0, MAX_QUERY);
  if (q) p.set("q", q);
  if (f.ficha) p.set("ficha", "1");
  return p.toString();
}

export const activeFilterCount = (f: CatalogFilter): number =>
  f.categories.length + f.brands.length + (f.q.trim() ? 1 : 0) + (f.ficha ? 1 : 0);

/** Drops categories/brands that do not exist (stale links) and canonicalizes brand spelling. */
export function sanitizeFilter(
  f: CatalogFilter,
  known: { categories: readonly string[]; brands: readonly string[] },
): CatalogFilter {
  const cats = new Set(known.categories);
  const brandByNorm = new Map(known.brands.map((b) => [normalizeText(b), b]));
  return {
    categories: [...new Set(f.categories.filter((c) => cats.has(c)))],
    brands: [
      ...new Set(
        f.brands.flatMap((b) => {
          const hit = brandByNorm.get(normalizeText(b));
          return hit ? [hit] : [];
        }),
      ),
    ],
    q: f.q,
    ficha: f.ficha,
  };
}

const haystacks = new WeakMap<CatalogItem, string>();
function haystack(i: CatalogItem): string {
  let h = haystacks.get(i);
  if (h === undefined) {
    h = normalizeText(`${i.name} ${i.brand ?? ""} ${i.code}`);
    haystacks.set(i, h);
  }
  return h;
}

type Skip = "categories" | "brands" | "ficha" | undefined;

function matches(i: CatalogItem, f: CatalogFilter, words: string[], skip: Skip): boolean {
  if (skip !== "categories" && f.categories.length > 0 && !f.categories.includes(i.category)) return false;
  if (skip !== "brands" && f.brands.length > 0 && (i.brand === null || !f.brands.includes(i.brand))) return false;
  if (skip !== "ficha" && f.ficha && !i.hasFicha) return false;
  if (words.length > 0) {
    const h = haystack(i);
    if (!words.every((w) => h.includes(w))) return false;
  }
  return true;
}

const searchWords = (q: string): string[] => normalizeText(q).split(/\s+/).filter(Boolean);

export function filterItems(items: readonly CatalogItem[], f: CatalogFilter): CatalogItem[] {
  const words = searchWords(f.q);
  return items.filter((i) => matches(i, f, words, undefined));
}

export type Facets = {
  resultCount: number;
  /** Items per category under the other filters (own dimension ignored). */
  categoryCounts: Record<string, number>;
  /** Sum of categoryCounts: what "Todos" would show. */
  categoryTotal: number;
  /** Every brand, sorted, with its count under the other filters (own dimension ignored). */
  brands: { name: string; count: number }[];
  /** Products with a ficha técnica under the other filters (own dimension ignored). */
  fichaCount: number;
};

export function computeFacets(items: readonly CatalogItem[], f: CatalogFilter): Facets {
  const words = searchWords(f.q);
  const categoryCounts: Record<string, number> = {};
  const brandCounts = new Map<string, number>();
  let resultCount = 0;
  let categoryTotal = 0;
  let fichaCount = 0;
  for (const i of items) {
    if (i.brand !== null && !brandCounts.has(i.brand)) brandCounts.set(i.brand, 0);
    if (matches(i, f, words, undefined)) resultCount++;
    if (matches(i, f, words, "categories")) {
      categoryCounts[i.category] = (categoryCounts[i.category] ?? 0) + 1;
      categoryTotal++;
    }
    if (i.hasFicha && matches(i, f, words, "ficha")) fichaCount++;
    if (i.brand !== null && matches(i, f, words, "brands")) {
      brandCounts.set(i.brand, (brandCounts.get(i.brand) ?? 0) + 1);
    }
  }
  const brands = [...brandCounts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  return { resultCount, categoryCounts, categoryTotal, brands, fichaCount };
}
