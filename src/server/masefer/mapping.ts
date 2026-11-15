import type { DdpDoc } from "./ddp";
import type { MaseferCategory, SupplierCatalog, SupplierDocument, SupplierProduct, SupplierVariant } from "./types";

export type { DdpDoc };

const SUPPLIER_PRICE_LIST = 5;

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;

/** True when the URL path (query ignored) ends in a raster image extension; videos/PDFs are not images. */
export function isImageUrl(link: unknown): link is string {
  if (typeof link !== "string") return false;
  try {
    return IMAGE_EXT.test(new URL(link).pathname);
  } catch {
    return false;
  }
}

/** Lowercase, accents/spaces/punctuation removed: "Ficha  Técnica" -> "fichatecnica". */
const squash = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const KNOWN_LABELS: Record<string, string> = {
  fichatecnica: "Ficha técnica",
  licenciairam: "Licencia IRAM",
  iram: "IRAM",
  isp: "ISP",
  niosh: "NIOSH",
  ansi: "ANSI",
  colocacion: "Instructivo de colocación",
  instructivodecolocacion: "Instructivo de colocación",
  certificadoachs: "Certificado ACHS",
};

const titleCase = (s: string) =>
  s
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

/** Readable label for a `/web/catalogos/` document from its shortName (falls back to the file name). */
export function documentLabel(shortName: unknown, name: unknown): string {
  const raw = typeof shortName === "string" && shortName.trim() ? shortName : String(name ?? "").replace(/\.pdf$/i, "");
  const key = squash(raw);
  if (KNOWN_LABELS[key]) return KNOWN_LABELS[key];
  if (key.startsWith("testresultsandreport")) return "Informe de ensayo";
  return titleCase(raw) || "Documento";
}

const isPdfLink = (link: string) => {
  try {
    return /\.pdf$/i.test(new URL(link).pathname);
  } catch {
    return false;
  }
};

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

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
    if (!m || !isImageUrl(d.fields.link)) continue;
    const e = images.get(d.fields.ownerId) ?? { small: [], large: [] };
    (m[1] === "200" ? e.small : e.large).push(d.fields.link);
    images.set(d.fields.ownerId, e);
  }

  // `/web/catalogos/` PDFs per owner: deduped by url, ficha first then by label.
  const documents = new Map<string, SupplierDocument[]>();
  for (const d of of("dropbox")) {
    const f = d.fields;
    if (f.source !== "web" || !d.id.startsWith("/web/catalogos/")) continue;
    if (typeof f.ownerId !== "string" || typeof f.link !== "string") continue;
    const pdf = (typeof f.ext === "string" && f.ext.toLowerCase() === "pdf") || isPdfLink(f.link);
    if (!pdf) continue;
    try {
      new URL(f.link);
    } catch {
      continue;
    }
    const list = documents.get(f.ownerId) ?? [];
    if (list.some((x) => x.url === f.link)) continue;
    list.push({
      kind: squash(String(f.shortName ?? "")) === "fichatecnica" ? "ficha" : "certificacion",
      label: documentLabel(f.shortName, f.name),
      url: f.link,
      name: typeof f.name === "string" ? f.name : "",
    });
    documents.set(f.ownerId, list);
  }
  for (const list of documents.values()) {
    list.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "ficha" ? -1 : 1) || cmp(a.label, b.label) || cmp(a.url, b.url));
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
        documents: documents.get(f.GENERICO) ?? [],
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
