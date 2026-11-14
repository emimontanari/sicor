import type { DdpDoc } from "./ddp";
import type { MaseferCategory, SupplierCatalog, SupplierProduct, SupplierVariant } from "./types";

export type { DdpDoc };

const SUPPLIER_PRICE_LIST = 5;

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapVariant(f: Record<string, any>): SupplierVariant {
  const stock = (f.stock ?? {}) as Record<string, number>;
  return {
    sku: f.ARTICULO,
    color: f.COLOR,
    size: f.TALLE,
    text: f.TEXTO,
    stockTotal: Object.values(stock).reduce((a, b) => a + (Number(b) || 0), 0),
    published: f.PUBLICA_WEB === "S",
  };
}

/** Pure mapping: raw DDP documents (all collections, merged) -> normalized supplier catalog. */
export function mapCatalog(docs: DdpDoc[]): SupplierCatalog {
  const of = (c: string) => docs.filter((d) => d.collection === c);

  const images = new Map<string, { small: string[]; large: string[] }>();
  for (const d of of("dropbox")) {
    if (d.fields.source !== "web") continue;
    const m = /^\/web\/img(200|500)\//.exec(d.id);
    if (!m) continue;
    const e = images.get(d.fields.ownerId) ?? { small: [], large: [] };
    (m[1] === "200" ? e.small : e.large).push(d.fields.link);
    images.set(d.fields.ownerId, e);
  }

  const products = new Map<string, SupplierProduct>();
  for (const { fields: f } of of("web_articulos")) {
    let p = products.get(f.GENERICO);
    if (!p) {
      p = {
        code: f.GENERICO,
        name: f.DENOMINACION,
        description: null,
        brand: f.MARCA,
        brandId: f.MARCAS_ID,
        metaCategory: f.METACATEGORIA,
        family: f.FAMILIA,
        subfamily: f.SUBFAMILIA,
        unit: f.UMEDIDA,
        supplierPrice: null,
        currency: f.NOMBRE_MONEDA,
        images: images.get(f.GENERICO) ?? { small: [], large: [] },
        variants: [],
      };
      products.set(f.GENERICO, p);
    }
    if (f.PRECIOS_ID === SUPPLIER_PRICE_LIST) {
      p.supplierPrice = f.PRECIO;
      p.currency = f.NOMBRE_MONEDA;
    }
  }

  for (const { fields: f } of of("subarticulos")) products.get(f.GENERICO)?.variants.push(mapVariant(f));

  return {
    metaCategories: of("web_metacategorias").map((d) => d.fields.nombre),
    categories: of("web_categorias").map((d) => ({ metaCategory: d.fields.metaCategoria, subfamily: d.fields.subfamilia }) satisfies MaseferCategory),
    brands: of("web_marcas").map((d) => d.fields.DESCRIPCION),
    products: [...products.values()],
  };
}
