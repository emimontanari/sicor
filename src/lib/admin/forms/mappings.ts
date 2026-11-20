type FormLike = { get(name: string): FormDataEntryValue | null };

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
