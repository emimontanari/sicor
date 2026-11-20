import { describe, expect, it } from "vitest";
import {
  BULK_ITEMS,
  CLEAR_SELECTION_LABEL,
  bulkButtonLabel,
  bulkDisabled,
  selectAllLabel,
  selectFilteredLabel,
  selectedCountText,
  sheetScopeText,
} from "../../../src/lib/admin/products/bulk";

describe("BULK_ITEMS", () => {
  it("lists the simple bulk sheet actions in order", () => {
    expect(BULK_ITEMS).toEqual([
      { id: "show", label: "Mostrar" },
      { id: "hide", label: "Ocultar" },
      { id: "reviewed", label: "Marcar como revisados" },
      { id: "unreview", label: "Marcar como nuevo" },
    ]);
  });
});

describe("bulkButtonLabel / bulkDisabled", () => {
  it("no count in parentheses and disabled while nothing is selected", () => {
    expect(bulkButtonLabel(0)).toBe("Acciones");
    expect(bulkDisabled(0)).toBe(true);
  });
  it("shows the selected count in parentheses and is enabled", () => {
    expect(bulkButtonLabel(1)).toBe("Acciones (1)");
    expect(bulkButtonLabel(3)).toBe("Acciones (3)");
    expect(bulkDisabled(1)).toBe(false);
    expect(bulkDisabled(3)).toBe(false);
  });
  it("never shows a count below zero", () => {
    expect(bulkButtonLabel(-1)).toBe("Acciones");
    expect(bulkDisabled(-1)).toBe(true);
  });
});

describe("selectAllLabel", () => {
  it("names the action and the page row count in parentheses", () => {
    expect(selectAllLabel(25)).toBe("Seleccionar página (25)");
    expect(selectAllLabel(1)).toBe("Seleccionar página (1)");
    expect(selectAllLabel(0)).toBe("Seleccionar página (0)");
  });
});

describe("select across pages (S5)", () => {
  it("selectFilteredLabel names the action and the filtered total in parentheses", () => {
    expect(selectFilteredLabel(552)).toBe("Seleccionar todos los filtrados (552)");
    expect(selectFilteredLabel(1)).toBe("Seleccionar todos los filtrados (1)");
    expect(selectFilteredLabel(0)).toBe("Seleccionar todos los filtrados (0)");
  });
  it("selectedCountText pluralizes", () => {
    expect(selectedCountText(552)).toBe("552 productos seleccionados");
    expect(selectedCountText(1)).toBe("1 producto seleccionado");
  });
  it("sheetScopeText shows the real scope the action will hit", () => {
    expect(sheetScopeText("all", 552)).toBe("Se aplicará a 552 productos");
    expect(sheetScopeText("all", 1)).toBe("Se aplicará a 1 producto");
    expect(sheetScopeText("codes", 3)).toBe("3 seleccionados en esta página");
    expect(sheetScopeText("codes", 1)).toBe("1 seleccionado en esta página");
  });
  it("clear-selection button label", () => {
    expect(CLEAR_SELECTION_LABEL).toBe("Quitar selección");
  });
});
