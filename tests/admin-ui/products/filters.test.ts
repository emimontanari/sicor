import { describe, expect, it } from "vitest";
import {
  ESTADO_OPTIONS,
  activeFilterCount,
  clearFiltersHref,
  filterChips,
  isNavCurrent,
  optionHref,
} from "../../../src/lib/admin/products/filters";
import { FILTER_LABELS, FILTER_SLUGS, parseListQuery } from "../../../src/lib/admin/products/query";

const cats = [
  { slug: "tornillos", name: "Tornillos" },
  { slug: "otros", name: "Otros" },
];

describe("ESTADO_OPTIONS", () => {
  it("offers only Todos, Visibles, Ocultos, Eliminados (publish-on-sync S3)", () => {
    expect(ESTADO_OPTIONS).toEqual([
      { slug: "todos", label: "Todos", countKey: "all" },
      { slug: "visibles", label: "Visibles", countKey: "visible" },
      { slug: "ocultos", label: "Ocultos", countKey: "hidden" },
      { slug: "eliminados", label: "Eliminados", countKey: "eliminados" },
    ]);
  });
  it("nuevos/discontinuados stay parsable (tolerated) but are never offered", () => {
    expect(FILTER_SLUGS).toContain("nuevos");
    expect(FILTER_SLUGS).toContain("discontinuados");
    expect(ESTADO_OPTIONS.map((o) => o.slug)).not.toContain("nuevos");
    expect(ESTADO_OPTIONS.map((o) => o.slug)).not.toContain("discontinuados");
    expect(FILTER_LABELS.nuevos).toBeTruthy();
  });
});

describe("activeFilterCount", () => {
  it("counts estado and categoría, never the search or page", () => {
    expect(activeFilterCount(parseListQuery({}))).toBe(0);
    expect(activeFilterCount(parseListQuery({ q: "x", page: "3" }))).toBe(0);
    expect(activeFilterCount(parseListQuery({ filtro: "ocultos" }))).toBe(1);
    expect(activeFilterCount(parseListQuery({ filtro: "ocultos", categoria: "otros" }))).toBe(2);
    expect(activeFilterCount(parseListQuery({ filtro: "zzz" }))).toBe(0);
  });
});

describe("filterChips", () => {
  it("is empty without filters", () => {
    expect(filterChips(parseListQuery({}), cats)).toEqual([]);
  });
  it("each chip removes only its own filter and resets the page", () => {
    const s = parseListQuery({ filtro: "ocultos", categoria: "tornillos", q: "m8", page: "4" });
    expect(filterChips(s, cats)).toEqual([
      { key: "filtro", label: "Ocultos", href: "/admin/productos?categoria=tornillos&q=m8" },
      { key: "categoria", label: "Tornillos", href: "/admin/productos?filtro=ocultos&q=m8" },
      { key: "q", label: "“m8”", href: "/admin/productos?filtro=ocultos&categoria=tornillos" },
    ]);
  });
  it("falls back to the slug for an unknown category", () => {
    expect(filterChips(parseListQuery({ categoria: "zz" }), cats)[0].label).toBe("zz");
  });
});

describe("clearFiltersHref / optionHref", () => {
  it("clear keeps the search and drops estado, categoría and page", () => {
    expect(clearFiltersHref(parseListQuery({ filtro: "nuevos", categoria: "otros", q: "a", page: "2" }))).toBe(
      "/admin/productos?q=a",
    );
    expect(clearFiltersHref(parseListQuery({ filtro: "nuevos" }))).toBe("/admin/productos");
  });
  it("option hrefs set one dimension, keep the rest and reset page", () => {
    const s = parseListQuery({ filtro: "ocultos", q: "a", page: "3" });
    expect(optionHref(s, { filtro: "visibles" })).toBe("/admin/productos?filtro=visibles&q=a");
    expect(optionHref(s, { categoria: "otros" })).toBe("/admin/productos?filtro=ocultos&categoria=otros&q=a");
    expect(optionHref(s, { categoria: undefined })).toBe("/admin/productos?filtro=ocultos&q=a");
  });
});

describe("isNavCurrent", () => {
  it("highlights the section by path; Productos covers every filtro (no separate Nuevos link, S2)", () => {
    const productos = { href: "/admin/productos" };
    expect(isNavCurrent(productos, "/admin/productos")).toBe(true);
    expect(isNavCurrent({ href: "/admin/productos?filtro=nuevos" }, "/admin/productos")).toBe(true);
    expect(isNavCurrent(productos, "/admin/productos/ABC")).toBe(true);
    expect(isNavCurrent({ href: "/admin/ajustes" }, "/admin/ajustes")).toBe(true);
    expect(isNavCurrent({ href: "/admin/ajustes" }, "/admin/productos")).toBe(false);
    expect(isNavCurrent(productos, "/admin/ajustes")).toBe(false);
  });
});
