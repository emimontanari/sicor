import { describe, expect, it } from "vitest";
import {
  listHref,
  parseBulkForm,
  parseListQuery,
  parseProductForm,
} from "../../../src/lib/admin/products/query";

const fd = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

describe("parseListQuery", () => {
  it("defaults", () => {
    expect(parseListQuery({})).toEqual({ filtro: "todos", filter: "all", categoria: undefined, q: "", page: 1 });
  });
  it("maps every tab slug", () => {
    expect(parseListQuery({ filtro: "visibles" }).filter).toBe("visible");
    expect(parseListQuery({ filtro: "ocultos" }).filter).toBe("hidden");
    expect(parseListQuery({ filtro: "nuevos" }).filter).toBe("nuevos");
    expect(parseListQuery({ filtro: "discontinuados" }).filter).toBe("discontinued");
  });
  it("falls back on junk and takes first of arrays", () => {
    const r = parseListQuery({ filtro: "zzz", page: "-3", q: ["  tornillo ", "x"], categoria: "" });
    expect(r).toEqual({ filtro: "todos", filter: "all", categoria: undefined, q: "tornillo", page: 1 });
    expect(parseListQuery({ page: "abc" }).page).toBe(1);
    expect(parseListQuery({ page: "4" }).page).toBe(4);
  });
  it("caps the search length", () => {
    expect(parseListQuery({ q: "a".repeat(500) }).q.length).toBe(100);
  });
});

describe("listHref", () => {
  const base = parseListQuery({});
  it("omits defaults", () => {
    expect(listHref(base, {})).toBe("/admin/productos");
  });
  it("encodes state and resets page when filters change", () => {
    const s = parseListQuery({ filtro: "ocultos", categoria: "a b", q: "x y", page: "3" });
    expect(listHref(s, {})).toBe("/admin/productos?filtro=ocultos&categoria=a+b&q=x+y&page=3");
    expect(listHref(s, { filtro: "nuevos" })).toBe("/admin/productos?filtro=nuevos&categoria=a+b&q=x+y");
    expect(listHref(s, { page: 2 })).toContain("page=2");
  });
});

describe("parseProductForm", () => {
  it("maps fields, null for empty and default rule", () => {
    const p = parseProductForm(
      fd([
        ["customName", " Nombre "],
        ["customDescription", ""],
        ["customPrice", "12.50"],
        ["showPrice", "on"],
        ["visible", "default"],
        ["categoryId", ""],
      ]),
    );
    expect(p).toEqual({
      customName: " Nombre ",
      customDescription: null,
      customPrice: "12.50",
      showPrice: true,
      visible: null,
      categoryId: null,
    });
  });
  it("visible true/false, unchecked showPrice, numeric category", () => {
    const p = parseProductForm(fd([["visible", "false"], ["categoryId", "7"]]));
    expect(p.visible).toBe(false);
    expect(p.showPrice).toBe(false);
    expect(p.categoryId).toBe(7);
    expect(parseProductForm(fd([["visible", "true"]])).visible).toBe(true);
  });
  it("invalid category stays invalid for the data layer to reject", () => {
    expect(parseProductForm(fd([["categoryId", "abc"]])).categoryId).toBe("abc");
  });
});

describe("parseBulkForm", () => {
  it("show/hide/reviewed", () => {
    expect(parseBulkForm(fd([["code", "A"], ["code", "B"], ["intent", "show"]]))).toEqual({
      ok: true,
      codes: ["A", "B"],
      patch: { visible: true },
    });
    expect(parseBulkForm(fd([["code", "A"], ["intent", "hide"]]))).toMatchObject({ patch: { visible: false } });
    expect(parseBulkForm(fd([["code", "A"], ["intent", "reviewed"]]))).toMatchObject({ patch: { reviewed: true } });
  });
  it("category", () => {
    expect(parseBulkForm(fd([["code", "A"], ["intent", "category"], ["bulkCategory", "3"]]))).toMatchObject({
      patch: { categoryId: 3 },
    });
    expect(parseBulkForm(fd([["code", "A"], ["intent", "category"], ["bulkCategory", "none"]]))).toMatchObject({
      patch: { categoryId: null },
    });
    expect(parseBulkForm(fd([["code", "A"], ["intent", "category"], ["bulkCategory", ""]]))).toEqual({
      ok: false,
      error: "Elegí una categoría",
    });
  });
  it("errors", () => {
    expect(parseBulkForm(fd([["intent", "show"]]))).toEqual({ ok: false, error: "Seleccioná al menos un producto" });
    expect(parseBulkForm(fd([["code", "A"], ["intent", "x"]]))).toEqual({ ok: false, error: "Acción inválida" });
  });
});
