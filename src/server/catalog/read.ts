import { asc, eq } from "drizzle-orm";
import { createPgDb, type PgDb, type TestDb } from "../db";
import { effectiveVisibility } from "../db/effective";
import {
  categories,
  categoryMappings,
  productOverrides,
  settings,
  sourceProducts,
  sourceVariants,
} from "../db/schema";
import { documentUrl, imageUrl } from "./paths";

type Db = PgDb | TestDb;

export const OTHERS_SLUG = "otros";
export const OTHERS_NAME = "Otros productos";
export const DEFAULT_MESSAGE_TEMPLATE =
  "Hola, quisiera consultar cotización de los siguientes productos:";

export type CategoryInfo = { id: number | null; slug: string; name: string };
export type CategoryWithCount = CategoryInfo & { sortOrder: number; count: number };
export type CatalogVariant = {
  sku: string;
  color: string | null;
  size: string | null;
  text: string | null;
};
export type CatalogDocument = { kind: "ficha" | "certificacion"; label: string; url: string };
export type CatalogProduct = {
  code: string;
  name: string;
  description: string | null;
  images: string[];
  category: CategoryInfo | null;
  brand: string | null;
  unit: string | null;
  variants: CatalogVariant[];
  /** PDFs copied to our storage (ficha técnica first); app URLs only, never supplier links. */
  documents: CatalogDocument[];
  /** True when `documents` contains a ficha técnica. */
  hasFicha: boolean;
  colors: string[];
  sizes: string[];
  /** Only when settings.show_prices AND override.show_price; otherwise null (S2). */
  price: string | null;
};

let defaultDb: Db | undefined;
const resolveDb = (db?: Db): Db => (db ?? (defaultDb ??= createPgDb().db));

/** Lowercase, accent-stripped. */
export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

async function loadAll(db: Db) {
  const [settingsRow] = await db.select().from(settings).where(eq(settings.id, 1));
  const [products, overrides, variants, mappings, cats] = await Promise.all([
    db.select().from(sourceProducts).orderBy(asc(sourceProducts.name), asc(sourceProducts.code)),
    db.select().from(productOverrides),
    db.select().from(sourceVariants).orderBy(asc(sourceVariants.id)),
    db.select().from(categoryMappings),
    db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id)),
  ]);
  return { settingsRow, products, overrides, variants, mappings, cats };
}

const score = (m: { metaCategory: string; family: string; subfamily: string }) =>
  (m.metaCategory ? 1 : 0) + (m.family ? 2 : 0) + (m.subfamily ? 4 : 0);

async function buildCatalog(db: Db): Promise<CatalogProduct[]> {
  const { settingsRow, products, overrides, variants, mappings, cats } = await loadAll(db);
  const showPrices = settingsRow?.showPrices ?? false;
  const ovByCode = new Map(overrides.map((o) => [o.productCode, o]));
  const catById = new Map(cats.map((c) => [c.id, c]));
  const varsByCode = new Map<string, typeof variants>();
  for (const v of variants) {
    if (!v.published) continue;
    const arr = varsByCode.get(v.productCode) ?? [];
    arr.push(v);
    varsByCode.set(v.productCode, arr);
  }
  const ranked = mappings.filter((m) => score(m) > 0).sort((a, b) => score(b) - score(a));

  const out: CatalogProduct[] = [];
  for (const p of products) {
    const o = ovByCode.get(p.code) ?? null;
    if (!effectiveVisibility(p, o)) continue;

    let catId: number | null = o?.categoryId ?? null;
    if (catId === null) {
      const m = ranked.find(
        (r) =>
          (!r.metaCategory || r.metaCategory === p.metaCategory) &&
          (!r.family || r.family === p.family) &&
          (!r.subfamily || r.subfamily === p.subfamily),
      );
      catId = m?.categoryId ?? null;
    }
    const c = catId === null ? undefined : catById.get(catId);
    const vs = varsByCode.get(p.code) ?? [];
    const distinct = (xs: (string | null)[]) => [
      ...new Set(xs.filter((x): x is string => !!x)),
    ];
    const imgs = o?.customImagePath ? [o.customImagePath] : p.localImages;
    const documents = (p.localDocuments ?? []).map((d) => ({
      kind: d.kind,
      label: d.label,
      url: documentUrl(d.path, `${p.code}-${d.label}`),
    }));
    out.push({
      code: p.code,
      name: o?.customName ?? p.name,
      description: o?.customDescription ?? null,
      images: imgs.map(imageUrl),
      category: c ? { id: c.id, slug: c.slug, name: c.name } : null,
      brand: p.brand,
      unit: p.unit,
      variants: vs.map((v) => ({ sku: v.sku, color: v.color, size: v.size, text: v.text })),
      documents,
      hasFicha: documents.some((d) => d.kind === "ficha"),
      colors: distinct(vs.map((v) => v.color)),
      sizes: distinct(vs.map((v) => v.size)),
      price: showPrices && o?.showPrice ? (o.customPrice ?? null) : null,
    });
  }
  return out;
}

/** The 7 SICOR categories in order with visible-product counts, plus "Otros productos" when needed. */
export async function listCategories(db?: Db): Promise<CategoryWithCount[]> {
  const d = resolveDb(db);
  const [prods, cats] = await Promise.all([
    buildCatalog(d),
    d.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id)),
  ]);
  const result: CategoryWithCount[] = cats.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    sortOrder: c.sortOrder,
    count: prods.filter((p) => p.category?.id === c.id).length,
  }));
  const others = prods.filter((p) => p.category === null).length;
  if (others > 0) {
    result.push({
      id: null,
      slug: OTHERS_SLUG,
      name: OTHERS_NAME,
      sortOrder: Number.MAX_SAFE_INTEGER,
      count: others,
    });
  }
  return result;
}

/** Visible products, optionally filtered by category slug ("otros" = uncategorised) and search text. */
export async function listProducts(
  filter: { categorySlug?: string; search?: string } = {},
  db?: Db,
): Promise<CatalogProduct[]> {
  let prods = await buildCatalog(resolveDb(db));
  const { categorySlug, search } = filter;
  if (categorySlug) {
    prods = prods.filter((p) =>
      categorySlug === OTHERS_SLUG ? p.category === null : p.category?.slug === categorySlug,
    );
  }
  const q = normalizeText(search ?? "").trim();
  if (q) {
    prods = prods.filter((p) =>
      [p.name, p.brand ?? "", p.code].some((f) => normalizeText(f).includes(q)),
    );
  }
  return prods;
}

/** A visible product by code, or null (hidden/new/discontinued/unknown are indistinguishable). */
export async function getProduct(code: string, db?: Db): Promise<CatalogProduct | null> {
  const prods = await buildCatalog(resolveDb(db));
  return prods.find((p) => p.code === code) ?? null;
}

/** WhatsApp number/template from the settings row, falling back to env + default template. */
export async function getStorefrontSettings(
  db?: Db,
): Promise<{ whatsappNumber: string | null; messageTemplate: string }> {
  const [row] = await resolveDb(db).select().from(settings).where(eq(settings.id, 1));
  return {
    whatsappNumber: row?.whatsappNumber || process.env.WHATSAPP_NUMBER || null,
    messageTemplate: row?.messageTemplate || DEFAULT_MESSAGE_TEMPLATE,
  };
}
