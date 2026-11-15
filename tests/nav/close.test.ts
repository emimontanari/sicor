import { describe, expect, it } from "vitest";
import { catalogReturnHref, closeAction, effectiveQuery, isProductPath } from "../../src/lib/nav/close";

describe("catalogReturnHref", () => {
  it("returns to the product category, URL-encoded", () => {
    expect(catalogReturnHref("calzado-de-seguridad")).toBe("/?categoria=calzado-de-seguridad");
    expect(catalogReturnHref("a b")).toBe("/?categoria=a%20b");
  });
  it("falls back to the catalog home", () => {
    expect(catalogReturnHref(null)).toBe("/");
    expect(catalogReturnHref(undefined)).toBe("/");
    expect(catalogReturnHref("")).toBe("/");
  });
});

describe("closeAction", () => {
  it("goes back when there is a previous history entry", () => {
    expect(closeAction(2)).toBe("back");
    expect(closeAction(30)).toBe("back");
  });
  it("goes home when the sheet is the only entry", () => {
    expect(closeAction(1)).toBe("home");
    expect(closeAction(0)).toBe("home");
  });
});

describe("isProductPath / effectiveQuery", () => {
  it("detects product routes", () => {
    expect(isProductPath("/producto/CAM%201")).toBe(true);
    expect(isProductPath("/producto/x/")).toBe(true);
    expect(isProductPath("/")).toBe(false);
    expect(isProductPath("/producto")).toBe(false);
    expect(isProductPath(null)).toBe(false);
  });
  it("uses the live query on the catalog and the frozen one under a product sheet", () => {
    expect(effectiveQuery("/", "categoria=a&q=x", "old")).toBe("categoria=a&q=x");
    expect(effectiveQuery("/producto/X1", "", "categoria=a&q=x")).toBe("categoria=a&q=x");
  });
});
