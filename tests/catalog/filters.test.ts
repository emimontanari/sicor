import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTER,
  activeFilterCount,
  computeFacets,
  filterItems,
  parseFilter,
  sanitizeFilter,
  serializeFilter,
  type CatalogItem,
} from "../../src/lib/catalog/filters";
import { toCatalogItem } from "../../src/lib/catalog/items";
import { categoryIcon, categoryShortName } from "../../src/lib/catalog/categories";

const item = (over: Partial<CatalogItem> & { code: string }): CatalogItem => ({
  name: `Producto ${over.code}`,
  brand: null,
  category: "otros",
  image: null,
  variants: false,
  price: null,
  ...over,
});

const ITEMS: CatalogItem[] = [
  item({ code: "REM01", name: "REMERA ALGODÓN PEINADO", brand: "MSF", category: "indumentaria-laboral" }),
  item({ code: "BOT100", name: "BOTIN DE SEGURIDAD", brand: "OMBU", category: "calzado-de-seguridad" }),
  item({ code: "ZAP2", name: "ZAPATILLA PRO", brand: "OMBU", category: "calzado-de-seguridad" }),
  item({ code: "GUA12", name: "GUANTE DE VAQUETA", brand: "Funcional Ltda", category: "guantes-de-proteccion" }),
  item({ code: "EXT05", name: "MATAFUEGO ABC", brand: null, category: "otros" }),
];

describe("parseFilter / serializeFilter (URL <-> state)", () => {
  it("parses repeated categoria/marca and q from URLSearchParams", () => {
    const f = parseFilter(new URLSearchParams("categoria=a&categoria=b&marca=OMBU&q=guante"));
    expect(f).toEqual({ categories: ["a", "b"], brands: ["OMBU"], q: "guante" });
  });
  it("trims, drops empties and duplicates", () => {
    const f = parseFilter(new URLSearchParams("categoria=a&categoria= b &categoria=&categoria=a&marca= OMBU &q=%20%20x%20"));
    expect(f).toEqual({ categories: ["a", "b"], brands: ["OMBU"], q: "x" });
  });
  it("accepts a Next searchParams record (string | string[] | undefined)", () => {
    expect(parseFilter({ categoria: ["a", "b"], marca: "OMBU", q: undefined })).toEqual({
      categories: ["a", "b"],
      brands: ["OMBU"],
      q: "",
    });
  });
  it("caps q at 100 chars", () => {
    expect(parseFilter(new URLSearchParams("q=" + "x".repeat(300))).q).toHaveLength(100);
  });
  it("empty params give the empty filter", () => {
    expect(parseFilter(new URLSearchParams(""))).toEqual(EMPTY_FILTER);
  });
  it("serializes in a stable order without a leading '?'", () => {
    expect(serializeFilter({ categories: ["a", "b"], brands: ["OMBU", "3M"], q: "guante verde" })).toBe(
      "categoria=a&categoria=b&marca=OMBU&marca=3M&q=guante+verde",
    );
    expect(serializeFilter(EMPTY_FILTER)).toBe("");
  });
  it("round-trips brands with spaces, accents, commas and ampersands", () => {
    const f = { categories: ["calzado-de-seguridad"], brands: ["Funcional Ltda", "A&B, Ñandú"], q: "bota 38/48 & más" };
    expect(parseFilter(new URLSearchParams(serializeFilter(f)))).toEqual(f);
  });
  it("counts active filters (q counts as one)", () => {
    expect(activeFilterCount(EMPTY_FILTER)).toBe(0);
    expect(activeFilterCount({ categories: ["a", "b"], brands: ["x"], q: "y" })).toBe(4);
  });
});

describe("sanitizeFilter", () => {
  const known = { categories: ["calzado-de-seguridad", "otros"], brands: ["OMBU", "Funcional Ltda"] };
  it("drops unknown categories/brands and canonicalizes brand case/accents", () => {
    expect(
      sanitizeFilter({ categories: ["otros", "nope", "otros"], brands: ["ombu", "ghost", "FUNCIONAL LTDA"], q: "a" }, known),
    ).toEqual({ categories: ["otros"], brands: ["OMBU", "Funcional Ltda"], q: "a" });
  });
});

describe("filterItems", () => {
  const codes = (f: Partial<typeof EMPTY_FILTER>) =>
    filterItems(ITEMS, { ...EMPTY_FILTER, ...f }).map((i) => i.code);
  it("returns everything for the empty filter", () => {
    expect(codes({})).toEqual(["REM01", "BOT100", "ZAP2", "GUA12", "EXT05"]);
  });
  it("filters by category (multi = OR)", () => {
    expect(codes({ categories: ["calzado-de-seguridad"] })).toEqual(["BOT100", "ZAP2"]);
    expect(codes({ categories: ["calzado-de-seguridad", "otros"] })).toEqual(["BOT100", "ZAP2", "EXT05"]);
  });
  it("filters by brand (multi = OR); products without brand never match a brand filter", () => {
    expect(codes({ brands: ["OMBU"] })).toEqual(["BOT100", "ZAP2"]);
    expect(codes({ brands: ["OMBU", "MSF"] })).toEqual(["REM01", "BOT100", "ZAP2"]);
  });
  it("combines dimensions with AND", () => {
    expect(codes({ categories: ["calzado-de-seguridad"], brands: ["MSF"] })).toEqual([]);
    expect(codes({ categories: ["calzado-de-seguridad"], q: "zapat" })).toEqual(["ZAP2"]);
  });
  it("search ignores case and accents, matches name, brand and code, all words required", () => {
    expect(codes({ q: "algodon" })).toEqual(["REM01"]);
    expect(codes({ q: "REM01" })).toEqual(["REM01"]);
    expect(codes({ q: "ombu bot" })).toEqual(["BOT100"]);
    expect(codes({ q: "ombu guante" })).toEqual([]);
    expect(codes({ q: "   " })).toHaveLength(5);
  });
});

describe("computeFacets", () => {
  it("category counts ignore the category filter but respect brand and q", () => {
    const f = computeFacets(ITEMS, { categories: ["guantes-de-proteccion"], brands: ["OMBU"], q: "" });
    expect(f.categoryCounts).toEqual({ "calzado-de-seguridad": 2 });
    expect(f.categoryTotal).toBe(2);
  });
  it("brand counts ignore the brand filter but respect category and q; brands are sorted, brandless excluded", () => {
    const f = computeFacets(ITEMS, { categories: ["calzado-de-seguridad"], brands: ["MSF"], q: "" });
    expect(f.brands.map((b) => b.name)).toEqual(["Funcional Ltda", "MSF", "OMBU"]);
    expect(Object.fromEntries(f.brands.map((b) => [b.name, b.count]))).toEqual({
      "Funcional Ltda": 0,
      MSF: 0,
      OMBU: 2,
    });
  });
  it("reports the filtered result count", () => {
    expect(computeFacets(ITEMS, { categories: [], brands: [], q: "guante" }).resultCount).toBe(1);
  });
});

describe("toCatalogItem", () => {
  const base = {
    code: "C1",
    name: "Camisa",
    description: "long description not needed on the client",
    images: ["/images/C1/a.jpg", "/images/C1/b.jpg"],
    category: { id: 1, slug: "indumentaria-laboral", name: "Indumentaria laboral" },
    brand: "MSF",
    unit: "u",
    variants: [],
    colors: [],
    sizes: [],
    price: null,
    documents: [],
    hasFicha: false,
  };
  it("slims the product to what the list needs", () => {
    expect(toCatalogItem(base)).toEqual({
      code: "C1",
      name: "Camisa",
      brand: "MSF",
      category: "indumentaria-laboral",
      image: "/images/C1/a.jpg",
      variants: false,
      price: null,
      hasFicha: false,
    });
  });
  it("adds hasFicha and the ficha url only when the product has a ficha", () => {
    const doc = (kind: "ficha" | "certificacion", url: string) => ({ kind, label: kind, url });
    const withFicha = toCatalogItem({
      ...base,
      hasFicha: true,
      documents: [doc("certificacion", "/docs/C1/1-b.pdf"), doc("ficha", "/docs/C1/0-a.pdf")],
    });
    expect(withFicha.hasFicha).toBe(true);
    expect(withFicha.fichaUrl).toBe("/docs/C1/0-a.pdf");
    expect(withFicha).not.toHaveProperty("documents");
    expect(toCatalogItem({ ...base, documents: [doc("certificacion", "/docs/C1/1-b.pdf")] })).toMatchObject({ hasFicha: false });
    expect(toCatalogItem(base)).not.toHaveProperty("fichaUrl");
  });
  it("uses 'otros' when uncategorised, null image when none, and flags required variants", () => {
    const i = toCatalogItem({ ...base, category: null, images: [], sizes: ["M"], colors: [] });
    expect(i.category).toBe("otros");
    expect(i.image).toBeNull();
    expect(i.variants).toBe(true);
    expect(toCatalogItem({ ...base, colors: ["rojo"] }).variants).toBe(true);
  });
});

describe("category presentation", () => {
  it("has short names and icons for known slugs and safe fallbacks", () => {
    expect(categoryShortName("calzado-de-seguridad", "Calzado de seguridad")).toBe("Calzado");
    expect(categoryShortName("nuevo", "Cat Nueva")).toBe("Cat Nueva");
    expect(categoryIcon("calzado-de-seguridad")).toBe("shoe");
    expect(categoryIcon("otros")).toBe("box");
    expect(categoryIcon("nuevo")).toBe("box");
  });
});
