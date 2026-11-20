import { describe, expect, it } from "vitest";
import { BULK_ITEMS, bulkButtonLabel, bulkDisabled, selectAllLabel } from "../../../src/lib/admin/products/bulk";

describe("BULK_ITEMS", () => {
  it("lists the simple bulk sheet actions in order", () => {
    expect(BULK_ITEMS).toEqual([
      { id: "show", label: "Mostrar" },
      { id: "hide", label: "Ocultar" },
      { id: "reviewed", label: "Marcar como revisados" },
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
