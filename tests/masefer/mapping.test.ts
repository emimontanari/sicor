import { describe, expect, it } from "vitest";
import catalogFixture from "../fixtures/masefer/catalog.json";
import variantsFixture from "../fixtures/masefer/variants.json";
import { mapCatalog, type DdpDoc } from "../../src/server/masefer/mapping";

const catalogDocs = catalogFixture.docs as unknown as DdpDoc[];
const variantDocs = variantsFixture as unknown as DdpDoc[];

describe("mapCatalog", () => {
  const catalog = mapCatalog([...catalogDocs, ...variantDocs]);

  it("maps taxonomy", () => {
    expect(catalog.metaCategories).toContain("Calzado");
    expect(catalog.categories).toContainEqual({ metaCategory: "Calzado", subfamily: "BORCEGUIES" });
    expect(catalog.brands.length).toBeGreaterThan(0);
    expect(catalog.brands.every((b) => typeof b === "string")).toBe(true);
  });

  it("maps one product per GENERICO with supplier price list 5", () => {
    expect(catalog.products.map((p) => p.code).sort()).toEqual(catalogFixture.codes.slice().sort());
    const pac = catalog.products.find((p) => p.code === "PAC25")!;
    expect(pac).toMatchObject({
      name: "PANTALON CARGO RIPSTOP MASEFER",
      brand: "MSF",
      brandId: 26,
      metaCategory: "Indumentaria",
      family: "CONFECCION STOCK",
      subfamily: "PANTALONES CARGO",
      unit: "UN.",
      supplierPrice: 45950,
      currency: "PESOS",
    });
    expect(pac.description ?? null).toBeNull();
  });

  it("groups small/large images by ownerId", () => {
    const sneak = catalog.products.find((p) => p.code === "SNEAKPRO")!;
    expect(sneak.images.small.length).toBeGreaterThan(0);
    expect(sneak.images.large.length).toBeGreaterThan(0);
    for (const l of [...sneak.images.small, ...sneak.images.large]) expect(l).toMatch(/^https?:\/\//);
  });

  it("attaches normalized variants with total stock", () => {
    const sneak = catalog.products.find((p) => p.code === "SNEAKPRO")!;
    expect(sneak.variants.length).toBe(5);
    const v = sneak.variants.find((x) => x.sku === "SNEAKPRO-02-35")!;
    expect(v).toEqual({
      sku: "SNEAKPRO-02-35",
      color: "BEIGE",
      size: "35",
      text: "ZAPATILLA SNEAKER PRO COMPOSITE BEIGE 35",
      stockTotal: 0,
      published: true,
    });
  });

  it("sums stock across warehouses and reads PUBLICA_WEB", () => {
    const docs: DdpDoc[] = [
      ...catalogDocs,
      { collection: "subarticulos", id: "X", fields: { ARTICULO: "X", COLOR: "R", GENERICO: "PAC25", PUBLICA_WEB: "N", TALLE: "M", TEXTO: "t", stock: { "1": 2, "2": 5 } } },
    ];
    const v = mapCatalog(docs).products.find((p) => p.code === "PAC25")!.variants[0];
    expect(v.stockTotal).toBe(7);
    expect(v.published).toBe(false);
  });

  it("ignores variants of unknown products and non-list-5 prices", () => {
    const base = catalogDocs.find((d) => d.collection === "web_articulos")!;
    const other = { ...base, id: "o", fields: { ...base.fields, PRECIOS_ID: 3, PRECIO: 1 } };
    const c = mapCatalog([...catalogDocs, other, { collection: "subarticulos", id: "Z", fields: { GENERICO: "NOPE", ARTICULO: "Z", stock: {} } }]);
    expect(c.products.find((p) => p.code === base.fields.GENERICO)!.supplierPrice).toBe(base.fields.PRECIO);
    expect(c.products.some((p) => p.code === "NOPE")).toBe(false);
  });
});
