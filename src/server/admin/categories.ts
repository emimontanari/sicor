import { asc, eq, max, sql } from "drizzle-orm";
import type { TestDb } from "../db";
import { categories, categoryMappings, productOverrides, sourceProducts } from "../db/schema";
import { AdminNotFoundError, AdminValidationError, type Db } from "./errors";
import { rankMappings, resolveMappedCategory, type AdminCategory } from "./products";

export const MAX_CATEGORY_NAME = 60;
/** The catalog's virtual «Otros» bucket owns this slug. */
const RESERVED_SLUG = "otros";

export type AdminCategoryWithCount = AdminCategory & { productCount: number };

/** "Señalización Vial" -> "senalizacion-vial" (lowercase, accents stripped, hyphens). */
export function slugifyCategory(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!name) throw new AdminValidationError({ name: "Ingresá un nombre" });
  if (name.length > MAX_CATEGORY_NAME) throw new AdminValidationError({ name: `Máximo ${MAX_CATEGORY_NAME} caracteres` });
  if (name.toLowerCase() === RESERVED_SLUG) throw new AdminValidationError({ name: "«Otros» es automático, elegí otro nombre" });
  return name;
}

const DUPLICATE = { name: "Ya existe una categoría con ese nombre" };

/** Admin list: every SICOR category in catalog order with its (non-archived) product count. */
export async function listCategoriesWithCounts(db: Db): Promise<AdminCategoryWithCount[]> {
  const d = db as TestDb;
  const [cats, products, overrides, mappings] = await Promise.all([
    d.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id)),
    d.select().from(sourceProducts),
    d.select().from(productOverrides),
    d.select().from(categoryMappings),
  ]);
  const ov = new Map(overrides.map((o) => [o.productCode, o]));
  const ranked = rankMappings(mappings);
  const counts = new Map<number, number>();
  for (const p of products) {
    const o = ov.get(p.code);
    if (o?.archivedAt) continue;
    const id = o?.categoryId ?? resolveMappedCategory(ranked, p);
    if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return cats.map((c) => ({ id: c.id, slug: c.slug, name: c.name, productCount: counts.get(c.id) ?? 0 }));
}

async function assertNameFree(d: TestDb, name: string, exceptId?: number) {
  const rows = await d
    .select({ id: categories.id })
    .from(categories)
    .where(sql`lower(${categories.name}) = ${name.toLowerCase()}`);
  if (rows.some((r) => r.id !== exceptId)) throw new AdminValidationError(DUPLICATE);
}

/** Adds a category at the end of the list; slug is generated from the name and kept unique. */
export async function createCategory(db: Db, rawName: string): Promise<AdminCategory> {
  const name = cleanName(rawName);
  const d = db as TestDb;
  return d.transaction(async (tx) => {
    await assertNameFree(tx as unknown as TestDb, name);
    const base = slugifyCategory(name) || "categoria";
    const taken = new Set((await tx.select({ slug: categories.slug }).from(categories)).map((r) => r.slug));
    taken.add(RESERVED_SLUG);
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    const [{ top }] = await tx.select({ top: max(categories.sortOrder) }).from(categories);
    const [row] = await tx
      .insert(categories)
      .values({ name, slug, sortOrder: (top ?? 0) + 1 })
      .returning();
    return { id: row.id, slug: row.slug, name: row.name };
  });
}

/** Renames only; the slug (public URL / icon key) and position stay. */
export async function renameCategory(db: Db, id: number, rawName: string): Promise<AdminCategory> {
  const name = cleanName(rawName);
  const d = db as TestDb;
  const [cur] = await d.select().from(categories).where(eq(categories.id, id));
  if (!cur) throw new AdminNotFoundError(`Categoría ${id} no encontrada`);
  await assertNameFree(d, name, id);
  const [row] = await d.update(categories).set({ name }).where(eq(categories.id, id)).returning();
  return { id: row.id, slug: row.slug, name: row.name };
}

/**
 * Deletes a category in one transaction: its automatic family mappings go away and
 * product overrides pointing at it are cleared, so those products fall into «Otros».
 */
export async function deleteCategory(db: Db, id: number): Promise<void> {
  const d = db as TestDb;
  await d.transaction(async (tx) => {
    const [cur] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.id, id));
    if (!cur) throw new AdminNotFoundError(`Categoría ${id} no encontrada`);
    await tx.delete(categoryMappings).where(eq(categoryMappings.categoryId, id));
    // Explicit even though the FK is ON DELETE SET NULL: keeps the intent visible and survives FK changes.
    await tx.update(productOverrides).set({ categoryId: null }).where(eq(productOverrides.categoryId, id));
    await tx.delete(categories).where(eq(categories.id, id));
  });
}
