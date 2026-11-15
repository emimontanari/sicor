type FormLike = { get(name: string): FormDataEntryValue | null };
type Param = string | string[] | undefined;

export type MappingFilter = { unmapped: boolean; q: string };

const str = (f: FormLike, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};

/** categoryId: null = remove the mapping ("Sin asignar"); NaN = invalid input. */
export function parseMappingForm(f: FormLike) {
  const raw = str(f, "categoryId").trim();
  return {
    triple: { metaCategory: str(f, "metaCategory"), family: str(f, "family"), subfamily: str(f, "subfamily") },
    categoryId: raw === "" ? null : /^\d+$/.test(raw) ? Number(raw) : Number.NaN,
  };
}

const first = (p: Param) => (Array.isArray(p) ? p[0] : p);

export function parseMappingFilter(sp: Record<string, Param>): MappingFilter {
  return { unmapped: first(sp.sin) === "1", q: (first(sp.q) ?? "").trim() };
}

type Row = {
  metaCategory: string;
  family: string;
  subfamily: string;
  effectiveCategory: unknown | null;
};

/** "Sin asignar (Otros)" = the catalog resolves no category for the triple. */
export function filterMappings<T extends Row>(rows: T[], f: MappingFilter): T[] {
  const q = f.q.toLowerCase();
  return rows.filter(
    (r) =>
      (!f.unmapped || r.effectiveCategory === null) &&
      (!q || `${r.metaCategory} ${r.family} ${r.subfamily}`.toLowerCase().includes(q)),
  );
}
