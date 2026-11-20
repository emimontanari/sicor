import { describe, expect, it } from "vitest";
import { backHref, editHref, rowMenuItems } from "../../../src/lib/admin/products/menu";
import { ESTADO_OPTIONS } from "../../../src/lib/admin/products/filters";
import { FILTER_BY_SLUG, FILTER_LABELS, FILTER_SLUGS, listHref, parseListQuery } from "../../../src/lib/admin/products/query";

const ids = (r: Parameters<typeof rowMenuItems>[0]) => rowMenuItems(r).map((i) => i.id);

describe("rowMenuItems", () => {
  it("visible active product: Editar, Ocultar, Eliminar (Eliminar is destructive)", () => {
    expect(rowMenuItems({ visible: true, archived: false, status: "active" })).toEqual([
      { id: "edit", label: "Editar" },
      { id: "hide", label: "Ocultar" },
      { id: "delete", label: "Eliminar", destructive: true },
    ]);
  });
  it("hidden active product offers Mostrar instead of Ocultar", () => {
    expect(ids({ visible: false, archived: false, status: "active" })).toEqual(["edit", "show", "delete"]);
  });
  it("archived product: Restaurar and Editar only", () => {
    expect(rowMenuItems({ visible: true, archived: true, status: "active" })).toEqual([
      { id: "restore", label: "Restaurar" },
      { id: "edit", label: "Editar" },
    ]);
  });
  it("discontinued product has no show/hide toggle (as before)", () => {
    expect(ids({ visible: false, archived: false, status: "discontinued" })).toEqual(["edit", "delete"]);
  });
});

describe("Eliminados filter", () => {
  it("parses the slug and maps it to the data filter", () => {
    const s = parseListQuery({ filtro: "eliminados" });
    expect(s.filtro).toBe("eliminados");
    expect(s.filter).toBe("eliminados");
    expect(FILTER_BY_SLUG.eliminados).toBe("eliminados");
    expect(FILTER_LABELS.eliminados).toBe("Eliminados");
  });
  it("builds hrefs and appears as an Estado option and chip", () => {
    expect(listHref(parseListQuery({}), { filtro: "eliminados" })).toBe("/admin/productos?filtro=eliminados");
    expect(FILTER_SLUGS).toContain("eliminados");
    expect(ESTADO_OPTIONS.find((o) => o.slug === "eliminados")).toMatchObject({ label: "Eliminados", countKey: "eliminados" });
  });
});

describe("editHref / backHref", () => {
  it("edit link carries the list query only when there is one", () => {
    expect(editHref("A 1", "/admin/productos")).toBe("/admin/productos/A%201");
    expect(editHref("A1", "/admin/productos?filtro=ocultos&page=2")).toBe(
      `/admin/productos/A1?from=${encodeURIComponent("/admin/productos?filtro=ocultos&page=2")}`,
    );
  });
  it("back link returns to the list query, or the plain list", () => {
    expect(backHref("/admin/productos?filtro=ocultos")).toBe("/admin/productos?filtro=ocultos");
    expect(backHref(undefined)).toBe("/admin/productos");
    expect(backHref("https://evil.example/x")).toBe("/admin/productos");
    expect(backHref("//evil.example")).toBe("/admin/productos");
    expect(backHref("/admin/ajustes")).toBe("/admin/productos");
    expect(backHref("/admin/productos/abc")).toBe("/admin/productos");
  });
});
