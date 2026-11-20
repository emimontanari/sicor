import { asc, eq, inArray } from "drizzle-orm";
import type { TestDb } from "../db";
import { effectiveVisibility } from "../db/effective";
import {
  categories,
  categoryMappings,
  productOverrides,
  settings,
  sourceProducts,
  sourceVariants,
} from "../db/schema";
import { imageUrl, normalizeText, OTHERS_SLUG } from "../catalog";
import { AdminNotFoundError, AdminValidationError, type Db } from "./errors";

export type AdminFilter = "all" | "visible" | "hidden" | "nuevos" | "discontinued" | "eliminados";
export const ADMIN_FILTERS: readonly AdminFilter[] = ["all", "visible", "hidden", "nuevos", "discontinued", "eliminados"];
export const MAX_BULK = 200;
export const MAX_NAME = 200;
export const MAX_DESCRIPTION = 2000;
const MAX_PRICE = 999_999_999_999.99;
const MAX_PAGE_SIZE = 200;

export type AdminCategory = { id: number; slug: string; name: string };
export type OverrideView = {
  visible: boolean | null;
  customName: string | null;
  customDescription: string | null;
  customPrice: string | null;
  showPrice: boolean;
  customImagePath: string | null;
  categoryId: number | null;
  reviewed: boolean;
  archivedAt: string | null;
  updatedAt: string;
};
export type AdminProductRow = {
  code: string;
  name: string;
  supplierName: string;
  brand: string | null;
  thumbnailUrl: string | null;
  status: "active" | "discontinued";
  visible: boolean;
  reviewed: boolean;
  isNew: boolean;
  archived: boolean;
  category: AdminCategory | null;
  override: OverrideView | null;
};
export type AdminCounts = Record<AdminFilter, number>;
export type AdminProductList = {
  items: AdminProductRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: AdminCounts;
};
export type ListAdminProductsInput = {
  filter?: AdminFilter;
  categorySlug?: string;
  search?: string;
  page?: number;
  /** Rows per page, or "all" for the unpaginated "Todos" view. */
  pageSize?: number | "all";
};

const score = (m: { metaCategory: string; family: string; subfamily: string }) =>
  (m.metaCategory ? 1 : 0) + (m.family ? 2 : 0) + (m.subfamily ? 4 : 0);

/** Resolves a Masefer triple to a category id using the catalog's most-specific-wins rule. */
export function resolveMappedCategory(
  ranked: { metaCategory: string; family: string; subfamily: string; categoryId: number }[],
  p: { metaCategory: string | null; family: string | null; subfamily: string | null },
): number | null {
  const m = ranked.find(
    (r) =>
      (!r.metaCategory || r.metaCategory === p.metaCategory) &&
      (!r.family || r.family === p.family) &&
      (!r.subfamily || r.subfamily === p.subfamily),
  );
  return m?.categoryId ?? null;
}

export const rankMappings = <T extends { metaCategory: string; family: string; subfamily: string }>(ms: T[]) =>
  ms.filter((m) => score(m) > 0).sort((a, b) => score(b) - score(a));

type OverrideRow = typeof productOverrides.$inferSelect;
const toOverrideView = (o: OverrideRow): OverrideView => ({
  visible: o.visible,
  customName: o.customName,
  customDescription: o.customDescription,
  customPrice: o.customPrice,
  showPrice: o.showPrice,
  customImagePath: o.customImagePath,
  categoryId: o.categoryId,
  reviewed: o.reviewed,
  archivedAt: o.archivedAt?.toISOString() ?? null,
  updatedAt: o.updatedAt.toISOString(),
});

const matches = (row: AdminProductRow, filter: AdminFilter): boolean => {
  if (filter === "eliminados") return row.archived;
  if (row.archived) return false;
  switch (filter) {
    case "all":
      return true;
    case "visible":
      return row.visible;
    case "hidden":
      return row.status === "active" && !row.visible;
    case "nuevos":
      return row.isNew;
    case "discontinued":
      return row.status === "discontinued";
  }
  return false;
};

/** Loads every supplier product with its override as an admin row (shared by the list and the scope=all bulk). */
async function loadAdminRows(d: TestDb): Promise<AdminProductRow[]> {
  const [settingsRow] = await d.select().from(settings).where(eq(settings.id, 1));
  const autoPublishNew = settingsRow?.autoPublishNew ?? false;
  const [products, overrides, mappings, cats] = await Promise.all([
    d.select().from(sourceProducts).orderBy(asc(sourceProducts.name), asc(sourceProducts.code)),
    d.select().from(productOverrides),
    d.select().from(categoryMappings),
    d.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id)),
  ]);
  const ovByCode = new Map(overrides.map((o) => [o.productCode, o]));
  const catById = new Map(cats.map((c) => [c.id, c]));
  const ranked = rankMappings(mappings);

  return products.map((p) => {
    const o = ovByCode.get(p.code) ?? null;
    const catId = o?.categoryId ?? resolveMappedCategory(ranked, p);
    const c = catId === null ? undefined : catById.get(catId);
    const thumb = o?.customImagePath ?? p.localImages[0] ?? null;
    return {
      code: p.code,
      name: o?.customName ?? p.name,
      supplierName: p.name,
      brand: p.brand,
      thumbnailUrl: thumb ? imageUrl(thumb) : null,
      status: p.status,
      visible: effectiveVisibility(p, o, { autoPublishNew }),
      reviewed: o?.reviewed ?? false,
      archived: !!o?.archivedAt,
      isNew: p.status === "active" && !(o?.reviewed ?? false) && (o?.visible ?? null) === null,
      category: c ? { id: c.id, slug: c.slug, name: c.name } : null,
      override: o ? toOverrideView(o) : null,
    };
  });
}

/** The exact same matching the list page uses: estado + categoria + busqueda. */
function adminFilteredList(
  rows: AdminProductRow[],
  filter: AdminFilter,
  categorySlug: string | undefined,
  search: string | undefined,
): AdminProductRow[] {
  const q = normalizeText(search ?? "").trim();
  const slug = categorySlug;
  return rows.filter((r) => {
    if (!matches(r, filter)) return false;
    if (slug && (slug === OTHERS_SLUG ? r.category !== null : r.category?.slug !== slug)) return false;
    if (q && ![r.name, r.supplierName, r.brand ?? "", r.code].some((f) => normalizeText(f).includes(q))) return false;
    return true;
  });
}

/** S3/S4: every supplier product with its override, filterable, searchable, paginated. */
export async function listAdminProducts(
  db: Db,
  input: ListAdminProductsInput = {},
): Promise<AdminProductList> {
  const d = db as TestDb;
  const filter = input.filter ?? "all";
  if (!ADMIN_FILTERS.includes(filter)) throw new AdminValidationError({ filter: "Filtro inválido" });
  const rows = await loadAdminRows(d);

  const counts = Object.fromEntries(
    ADMIN_FILTERS.map((f) => [f, rows.filter((r) => matches(r, f)).length]),
  ) as AdminCounts;

  const list = adminFilteredList(rows, filter, input.categorySlug, input.search);
  const total = list.length;
  const pageSize =
    input.pageSize === "all"
      ? Math.max(total, 1)
      : Math.min(Math.max(Math.trunc(input.pageSize ?? 25) || 25, 1), MAX_PAGE_SIZE);
  const lastPage = Math.max(Math.ceil(total / pageSize), 1);
  const requestedPage = Math.max(Math.trunc(input.page ?? 1) || 1, 1);
  const page = input.pageSize === "all" ? 1 : Math.min(requestedPage, lastPage);
  return { items: list.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, counts };
}

export type AdminProductDetail = {
  code: string;
  supplier: {
    name: string;
    brand: string | null;
    metaCategory: string | null;
    family: string | null;
    subfamily: string | null;
    unit: string | null;
    supplierPrice: string | null;
    currency: string | null;
    status: "active" | "discontinued";
    firstSeenAt: string;
    lastSeenAt: string;
  };
  override: OverrideView | null;
  archivedAt: string | null;
  effective: { name: string; visible: boolean; category: AdminCategory | null };
  variants: { sku: string; color: string | null; size: string | null; text: string | null; stockTotal: number | null; published: boolean }[];
  images: { supplier: string[]; custom: string | null };
};

/** Supplier data (read-only), override, variants and images for one product, or null. */
export async function getAdminProduct(db: Db, code: string): Promise<AdminProductDetail | null> {
  const d = db as TestDb;
  const [p] = await d.select().from(sourceProducts).where(eq(sourceProducts.code, code));
  if (!p) return null;
  const [o] = await d.select().from(productOverrides).where(eq(productOverrides.productCode, code));
  const [settingsRow] = await d.select().from(settings).where(eq(settings.id, 1));
  const [vs, mappings, cats] = await Promise.all([
    d.select().from(sourceVariants).where(eq(sourceVariants.productCode, code)).orderBy(asc(sourceVariants.id)),
    d.select().from(categoryMappings),
    d.select().from(categories),
  ]);
  const catId = o?.categoryId ?? resolveMappedCategory(rankMappings(mappings), p);
  const c = cats.find((x) => x.id === catId);
  return {
    code: p.code,
    supplier: {
      name: p.name,
      brand: p.brand,
      metaCategory: p.metaCategory,
      family: p.family,
      subfamily: p.subfamily,
      unit: p.unit,
      supplierPrice: p.supplierPrice,
      currency: p.currency,
      status: p.status,
      firstSeenAt: p.firstSeenAt.toISOString(),
      lastSeenAt: p.lastSeenAt.toISOString(),
    },
    override: o ? toOverrideView(o) : null,
    archivedAt: o?.archivedAt?.toISOString() ?? null,
    effective: {
      name: o?.customName ?? p.name,
      visible: effectiveVisibility(p, o, { autoPublishNew: settingsRow?.autoPublishNew ?? false }),
      category: c ? { id: c.id, slug: c.slug, name: c.name } : null,
    },
    variants: vs.map((v) => ({
      sku: v.sku,
      color: v.color,
      size: v.size,
      text: v.text,
      stockTotal: v.stockTotal,
      published: v.published,
    })),
    images: { supplier: p.localImages.map(imageUrl), custom: o?.customImagePath ? imageUrl(o.customImagePath) : null },
  };
}

export type OverridePatch = {
  customName?: string | null;
  customDescription?: string | null;
  customPrice?: number | string | null;
  showPrice?: boolean;
  visible?: boolean | null;
  categoryId?: number | null;
  reviewed?: boolean;
};

const PATCH_KEYS = ["customName", "customDescription", "customPrice", "showPrice", "visible", "categoryId", "reviewed"];

function text(v: unknown, max: number, field: string, errors: Record<string, string>): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== "string") {
    errors[field] = "Debe ser texto";
    return undefined;
  }
  const t = v.trim();
  if (t.length > max) {
    errors[field] = `Máximo ${max} caracteres`;
    return undefined;
  }
  return t === "" ? null : t;
}

type Clean = {
  customName?: string | null;
  customDescription?: string | null;
  customPrice?: string | null;
  showPrice?: boolean;
  visible?: boolean | null;
  categoryId?: number | null;
  reviewed?: boolean;
};

function cleanPatch(patch: unknown): { clean: Clean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const clean: Clean = {};
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    return { clean, errors: { patch: "Debe ser un objeto" } };
  }
  const p = patch as Record<string, unknown>;
  for (const k of Object.keys(p)) if (!PATCH_KEYS.includes(k)) errors[k] = "Campo desconocido";
  if ("customName" in p) {
    const v = text(p.customName, MAX_NAME, "customName", errors);
    if (v !== undefined) clean.customName = v;
  }
  if ("customDescription" in p) {
    const v = text(p.customDescription, MAX_DESCRIPTION, "customDescription", errors);
    if (v !== undefined) clean.customDescription = v;
  }
  if ("customPrice" in p) {
    const v = p.customPrice;
    if (v === null || v === "") clean.customPrice = null;
    else if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_PRICE) clean.customPrice = v.toFixed(2);
    else if (typeof v === "string" && /^\d+(\.\d{1,2})?$/.test(v.trim()) && Number(v) <= MAX_PRICE)
      clean.customPrice = Number(v.trim()).toFixed(2);
    else errors.customPrice = "Debe ser un número mayor o igual a 0";
  }
  for (const k of ["showPrice", "reviewed"] as const) {
    if (k in p) {
      if (typeof p[k] === "boolean") clean[k] = p[k] as boolean;
      else errors[k] = "Debe ser verdadero o falso";
    }
  }
  if ("visible" in p) {
    if (p.visible === null || typeof p.visible === "boolean") clean.visible = p.visible as boolean | null;
    else errors.visible = "Debe ser verdadero, falso o nulo";
  }
  if ("categoryId" in p) {
    if (p.categoryId === null || (typeof p.categoryId === "number" && Number.isInteger(p.categoryId)))
      clean.categoryId = p.categoryId as number | null;
    else errors.categoryId = "Categoría inválida";
  }
  if (Object.keys(clean).length === 0 && Object.keys(errors).length === 0) errors.patch = "Nada que actualizar";
  return { clean, errors };
}

async function assertCategory(d: TestDb, id: number | null | undefined) {
  if (id === null || id === undefined) return;
  const [c] = await d.select({ id: categories.id }).from(categories).where(eq(categories.id, id));
  if (!c) throw new AdminValidationError({ categoryId: "La categoría no existe" });
}

/** S2: validated upsert of product_overrides only. Unknown code → AdminNotFoundError. */
export async function updateOverride(db: Db, code: string, patch: OverridePatch): Promise<OverrideView> {
  const d = db as TestDb;
  const { clean, errors } = cleanPatch(patch);
  if (Object.keys(errors).length) throw new AdminValidationError(errors);
  const [p] = await d.select({ code: sourceProducts.code }).from(sourceProducts).where(eq(sourceProducts.code, code));
  if (!p) throw new AdminNotFoundError(`Producto ${code} no encontrado`);
  await assertCategory(d, clean.categoryId);
  const set: Clean = { ...clean };
  if (set.reviewed === undefined && typeof clean.visible === "boolean") set.reviewed = true;
  const updatedAt = new Date();
  const [row] = await d
    .insert(productOverrides)
    .values({ productCode: code, ...set, updatedAt })
    .onConflictDoUpdate({ target: productOverrides.productCode, set: { ...set, updatedAt } })
    .returning();
  return toOverrideView(row);
}

export type BulkPatch = { visible?: boolean; categoryId?: number | null; reviewed?: boolean };

/** Validates a BulkPatch; shared by the per-code and the scope=all bulk paths. */
function cleanBulkPatch(patch: unknown): { set: Clean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const set: Clean = {};
  const p = (patch ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(p)) if (!["visible", "categoryId", "reviewed"].includes(k)) errors[k] = "Campo desconocido";
  if ("visible" in p) {
    if (typeof p.visible === "boolean") set.visible = p.visible;
    else errors.visible = "Debe ser verdadero o falso";
  }
  if ("reviewed" in p) {
    if (typeof p.reviewed === "boolean") set.reviewed = p.reviewed;
    else errors.reviewed = "Debe ser verdadero o falso";
  }
  if ("categoryId" in p) {
    if (p.categoryId === null || (typeof p.categoryId === "number" && Number.isInteger(p.categoryId)))
      set.categoryId = p.categoryId as number | null;
    else errors.categoryId = "Categoría inválida";
  }
  if (Object.keys(set).length === 0 && !errors.visible && !errors.reviewed && !errors.categoryId && Object.keys(errors).length === 0)
    errors.patch = "Nada que actualizar";
  return { set, errors };
}

/** S2/S4: bulk show/hide, set category, mark reviewed. Max 200 codes, one transaction. */
export async function bulkUpdate(db: Db, codes: string[], patch: BulkPatch): Promise<{ updated: number }> {
  const d = db as TestDb;
  const errors: Record<string, string> = {};
  if (!Array.isArray(codes) || codes.some((c) => typeof c !== "string" || c === "")) errors.codes = "Códigos inválidos";
  const unique = Array.isArray(codes) ? [...new Set(codes)] : [];
  if (unique.length === 0) errors.codes = errors.codes ?? "Seleccioná al menos un producto";
  if (unique.length > MAX_BULK) errors.codes = `Máximo ${MAX_BULK} productos por operación`;
  const { set, errors: patchErrors } = cleanBulkPatch(patch);
  Object.assign(errors, patchErrors);
  if (Object.keys(errors).length) throw new AdminValidationError(errors);
  if (set.reviewed === undefined && typeof set.visible === "boolean") set.reviewed = true;

  return d.transaction(async (tx) => {
    const found = await tx.select({ code: sourceProducts.code }).from(sourceProducts).where(inArray(sourceProducts.code, unique));
    if (found.length !== unique.length) {
      const have = new Set(found.map((f) => f.code));
      throw new AdminNotFoundError(`Productos no encontrados: ${unique.filter((c) => !have.has(c)).join(", ")}`);
    }
    await assertCategory(tx as unknown as TestDb, set.categoryId);
    const updatedAt = new Date();
    await tx
      .insert(productOverrides)
      .values(unique.map((productCode) => ({ productCode, ...set, updatedAt })))
      .onConflictDoUpdate({ target: productOverrides.productCode, set: { ...set, updatedAt } });
    return { updated: unique.length };
  });
}

export type BulkFilteredInput = { filter?: AdminFilter; categorySlug?: string; search?: string };

/**
 * S5: bulk over the whole filtered list. The codes are resolved server-side with the exact
 * same matching the admin list uses (the client only sends the filter state, never codes);
 * updates run in MAX_BULK-sized chunks inside ONE transaction, so the scale is bounded
 * only by the data, unlike the explicit per-code path which keeps its 200 cap.
 */
export async function bulkUpdateFiltered(
  db: Db,
  input: BulkFilteredInput,
  patch: BulkPatch,
): Promise<{ updated: number }> {
  const d = db as TestDb;
  const filter = input.filter ?? "all";
  if (!ADMIN_FILTERS.includes(filter) || filter === "eliminados")
    throw new AdminValidationError({ filter: "Filtro inválido" });
  const { set, errors } = cleanBulkPatch(patch);
  if (Object.keys(errors).length) throw new AdminValidationError(errors);
  if (set.reviewed === undefined && typeof set.visible === "boolean") set.reviewed = true;
  const rows = await loadAdminRows(d);
  const codes = adminFilteredList(rows, filter, input.categorySlug, input.search).map((r) => r.code);
  if (codes.length === 0) throw new AdminValidationError({ codes: "No hay productos para este filtro" });
  await assertCategory(d, set.categoryId);
  const updatedAt = new Date();
  return d.transaction(async (tx) => {
    for (let i = 0; i < codes.length; i += MAX_BULK) {
      const chunk = codes.slice(i, i + MAX_BULK);
      await tx
        .insert(productOverrides)
        .values(chunk.map((productCode) => ({ productCode, ...set, updatedAt })))
        .onConflictDoUpdate({ target: productOverrides.productCode, set: { ...set, updatedAt } });
    }
    return { updated: codes.length };
  });
}

function cleanCodes(codes: string[]): string[] {
  const errors: Record<string, string> = {};
  if (!Array.isArray(codes) || codes.some((c) => typeof c !== "string" || c === "")) errors.codes = "Códigos inválidos";
  const unique = Array.isArray(codes) ? [...new Set(codes)] : [];
  if (unique.length === 0) errors.codes = errors.codes ?? "Seleccioná al menos un producto";
  if (unique.length > MAX_BULK) errors.codes = `Máximo ${MAX_BULK} productos por operación`;
  if (Object.keys(errors).length) throw new AdminValidationError(errors);
  return unique;
}

/** S3: sets or clears product_overrides.archived_at for known codes only; nothing else in the override changes. */
async function setArchived(db: Db, codes: string[], archived: boolean): Promise<{ updated: number }> {
  const d = db as TestDb;
  const unique = cleanCodes(codes);
  return d.transaction(async (tx) => {
    const found = await tx.select({ code: sourceProducts.code }).from(sourceProducts).where(inArray(sourceProducts.code, unique));
    if (found.length !== unique.length) {
      const have = new Set(found.map((f) => f.code));
      throw new AdminNotFoundError(`Productos no encontrados: ${unique.filter((c) => !have.has(c)).join(", ")}`);
    }
    const now = new Date();
    const set = { archivedAt: archived ? now : null, updatedAt: now };
    await tx
      .insert(productOverrides)
      .values(unique.map((productCode) => ({ productCode, ...set })))
      .onConflictDoUpdate({ target: productOverrides.productCode, set });
    return { updated: unique.length };
  });
}

/** S3: soft delete ("Eliminar"). Max 200 codes, one transaction; supplier rows are never deleted. */
export const archiveProducts = (db: Db, codes: string[]) => setArchived(db, codes, true);
/** S3: undo an archive ("Restaurar"); previous override fields are untouched. */
export const restoreProducts = (db: Db, codes: string[]) => setArchived(db, codes, false);

export async function listAdminCategories(db: Db): Promise<AdminCategory[]> {
  const rows = await (db as TestDb).select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id));
  return rows.map((c) => ({ id: c.id, slug: c.slug, name: c.name }));
}

