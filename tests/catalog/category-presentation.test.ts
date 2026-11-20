import { describe, expect, it } from "vitest";
import { categoryIcon, categoryShortName } from "../../src/lib/catalog/categories";
import { deleteConfirmText, productsLabel } from "../../src/lib/admin/forms/categories";

describe("category presentation fallbacks (admin-created categories)", () => {
  it("unknown slug → full name and generic icon", () => {
    expect(categoryShortName("senalizacion-vial", "Señalización vial")).toBe("Señalización vial");
    expect(categoryIcon("senalizacion-vial")).toBe("box");
  });
  it("known slugs keep their short name and icon", () => {
    expect(categoryShortName("calzado-de-seguridad", "Calzado de seguridad")).toBe("Calzado");
    expect(categoryIcon("calzado-de-seguridad")).toBe("shoe");
  });
});

describe("admin copy", () => {
  it("delete confirmation pluralizes and mentions «Otros»", () => {
    expect(deleteConfirmText(12)).toBe("Sus 12 productos pasan a «Otros» en el catálogo.");
    expect(deleteConfirmText(1)).toBe("Su producto pasa a «Otros» en el catálogo.");
    expect(deleteConfirmText(0)).toBe("No tiene productos.");
  });
  it("productsLabel", () => {
    expect(productsLabel(0)).toBe("0 productos");
    expect(productsLabel(1)).toBe("1 producto");
  });
});
