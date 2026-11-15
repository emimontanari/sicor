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

  it("keeps only image URLs (jpg/jpeg/png/webp/gif, case-insensitive, ignoring query)", () => {
    const dbx = (id: string, link: string): DdpDoc =>
      ({ collection: "dropbox", id, fields: { source: "web", ownerId: "PAC25", link } }) as unknown as DdpDoc;
    const docs = [
      ...catalogDocs.filter((d) => d.collection !== "dropbox"),
      dbx("/web/img500/1", "https://www.dropbox.com/scl/fi/x/PAC25-1.JPG?rlkey=a&raw=1"),
      dbx("/web/img500/2", "https://www.dropbox.com/scl/fi/x/PAC25-2.mp4?rlkey=a&raw=1"),
      dbx("/web/img500/3", "https://www.dropbox.com/scl/fi/x/ficha.pdf?raw=1"),
      dbx("/web/img500/4", "https://www.dropbox.com/scl/fi/x/PAC25-4.webp?raw=1"),
      dbx("/web/img200/5", "https://www.dropbox.com/scl/fi/x/PAC25-5.mp4?raw=1"),
      dbx("/web/img200/6", "https://www.dropbox.com/scl/fi/x/PAC25-6.png?raw=1"),
    ];
    const pac = mapCatalog(docs).products.find((p) => p.code === "PAC25")!;
    expect(pac.images.large).toEqual([
      "https://www.dropbox.com/scl/fi/x/PAC25-1.JPG?rlkey=a&raw=1",
      "https://www.dropbox.com/scl/fi/x/PAC25-4.webp?raw=1",
    ]);
    expect(pac.images.small).toEqual(["https://www.dropbox.com/scl/fi/x/PAC25-6.png?raw=1"]);
  });

  describe("documents (/web/catalogos PDFs)", () => {
    const doc = (owner: string, file: string, shortName: string, over: Record<string, unknown> = {}): DdpDoc =>
      ({
        collection: "dropbox",
        id: `/web/catalogos/${file}`,
        fields: { ownerId: owner, name: file, shortName, ext: "pdf", source: "web", link: `https://www.dropbox.com/scl/fi/x/${encodeURIComponent(file)}?rlkey=k&dl=0&&raw=1`, ...over },
      }) as unknown as DdpDoc;
    const base = catalogDocs.filter((d) => d.collection !== "dropbox");
    const docsOf = (code: string, extra: DdpDoc[]) => mapCatalog([...base, ...extra]).products.find((p) => p.code === code)!.documents ?? [];

    it("fixture: PAC25 has ficha first then IRAM licence; SNEAKPRO has none", () => {
      const c = mapCatalog([...catalogDocs, ...variantDocs]);
      expect(c.products.find((p) => p.code === "PAC25")!.documents!.map((d) => [d.kind, d.label])).toEqual([
        ["ficha", "Ficha técnica"],
        ["certificacion", "Licencia IRAM"],
      ]);
      expect(c.products.find((p) => p.code === "SNEAKPRO")!.documents).toEqual([]);
    });

    it("detects the ficha for 'ficha tecnica' and 'fichatecnica', ordered ficha first then by label", () => {
      const docs = docsOf("PAC25", [
        doc("PAC25", "b.pdf", "niosh"),
        doc("PAC25", "a.pdf", "fichatecnica"),
        doc("PAC25", "c.pdf", "ansi"),
      ]);
      expect(docs.map((d) => [d.kind, d.label, d.name])).toEqual([
        ["ficha", "Ficha técnica", "a.pdf"],
        ["certificacion", "ANSI", "c.pdf"],
        ["certificacion", "NIOSH", "b.pdf"],
      ]);
      expect(docs[0].url).toBe("https://www.dropbox.com/scl/fi/x/a.pdf?rlkey=k&dl=0&&raw=1");
      expect(Object.keys(docs[0]).sort()).toEqual(["kind", "label", "name", "url"]);
      expect(docsOf("PAC25", [doc("PAC25", "z.pdf", "Ficha  Técnica")])[0].kind).toBe("ficha");
    });

    it.each([
      ["licencia iram", "Licencia IRAM"],
      ["isp", "ISP"],
      ["niosh", "NIOSH"],
      ["ansi", "ANSI"],
      ["iram", "IRAM"],
      ["test results and report for libus ppe argon", "Informe de ensayo"],
      ["colocacion", "Instructivo de colocación"],
      ["certificado achs", "Certificado ACHS"],
      ["manual de uso", "Manual De Uso"],
    ])("labels %j as %j", (shortName, label) => {
      const [d] = docsOf("PAC25", [doc("PAC25", "x.pdf", shortName)]);
      expect(d).toMatchObject({ kind: "certificacion", label });
    });

    it("dedupes by url, ignores non-pdf, other sources, other folders and unknown owners", () => {
      const docs = docsOf("PAC25", [
        doc("PAC25", "a.pdf", "isp"),
        doc("PAC25", "a.pdf", "isp", {}),
        { ...doc("PAC25", "dup.pdf", "ansi", { link: "https://www.dropbox.com/scl/fi/x/a.pdf?rlkey=k&dl=0&&raw=1" }), id: "/web/catalogos/dup.pdf" },
        doc("PAC25", "v.mp4", "video", { ext: "mp4", link: "https://www.dropbox.com/scl/fi/x/v.mp4?raw=1" }),
        doc("PAC25", "s.pdf", "niosh", { source: "other" }),
        { ...doc("PAC25", "i.pdf", "ansi"), id: "/web/img500/i.pdf" } as DdpDoc,
        doc("NOPE", "n.pdf", "ansi"),
        doc("PAC25", "nolink.pdf", "ansi", { link: null }),
      ]);
      expect(docs.map((d) => d.name)).toEqual(["a.pdf"]);
    });

    it("accepts a link whose path ends in .pdf even if ext is missing", () => {
      const docs = docsOf("PAC25", [doc("PAC25", "q.pdf", "isp", { ext: undefined })]);
      expect(docs).toHaveLength(1);
    });
  });
});
