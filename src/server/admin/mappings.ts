import { and, eq, sql } from "drizzle-orm";
import type { TestDb } from "../db";
import { categories, categoryMappings, sourceProducts } from "../db/schema";
import { AdminNotFoundError, AdminValidationError, type Db } from "./errors";
import { rankMappings, resolveMappedCategory, type AdminCategory } from "./products";

export type MappingTriple = { metaCategory: string; family: string; subfamily: string };
export type MappingRow = MappingTriple & {
  productCount: number;
  /** Category set by an exact mapping of this triple, or null. */
  mappedCategory: AdminCategory | null;
  /** Category the catalog resolves for this triple (most specific mapping wins), or null = "Otros". */
  effectiveCategory: AdminCategory | null;
};

/** S7: distinct Masefer triples with product counts and their mapping. */
export async function listMappings(db: Db): Promise<MappingRow[]> {
  const d = db as TestDb;
  const [triples, mappings, cats] = await Promise.all([
    d
      .select({
        metaCategory: sql<string>`coalesce(${sourceProducts.metaCategory}, '')`,
        family: sql<string>`coalesce(${sourceProducts.family}, '')`,
        subfamily: sql<string>`coalesce(${sourceProducts.subfamily}, '')`,
        productCount: sql<number>`count(*)::int`,
      })
      .from(sourceProducts)
      .groupBy(
        sql`coalesce(${sourceProducts.metaCategory}, '')`,
        sql`coalesce(${sourceProducts.family}, '')`,
        sql`coalesce(${sourceProducts.subfamily}, '')`,
      ),
    d.select().from(categoryMappings),
    d.select().from(categories),
  ]);
  const catById = new Map(cats.map((c) => [c.id, { id: c.id, slug: c.slug, name: c.name }]));
  const ranked = rankMappings(mappings);
  return triples
    .map((t) => {
      const exact = mappings.find(
        (m) => m.metaCategory === t.metaCategory && m.family === t.family && m.subfamily === t.subfamily,
      );
      const eff = resolveMappedCategory(ranked, t);
      return {
        ...t,
        mappedCategory: exact ? (catById.get(exact.categoryId) ?? null) : null,
        effectiveCategory: eff === null ? null : (catById.get(eff) ?? null),
      };
    })
    .sort(
      (a, b) =>
        a.metaCategory.localeCompare(b.metaCategory) ||
        a.family.localeCompare(b.family) ||
        a.subfamily.localeCompare(b.subfamily),
    );
}

/** Upserts (or deletes when categoryId is null) the exact mapping for a triple. */
export async function setMapping(db: Db, triple: Partial<MappingTriple>, categoryId: number | null): Promise<void> {
  const d = db as TestDb;
  const t: MappingTriple = {
    metaCategory: (triple.metaCategory ?? "").trim(),
    family: (triple.family ?? "").trim(),
    subfamily: (triple.subfamily ?? "").trim(),
  };
  if (!t.metaCategory && !t.family && !t.subfamily)
    throw new AdminValidationError({ triple: "Indicá al menos una categoría de Masefer" });
  if (categoryId === null) {
    await d
      .delete(categoryMappings)
      .where(
        and(
          eq(categoryMappings.metaCategory, t.metaCategory),
          eq(categoryMappings.family, t.family),
          eq(categoryMappings.subfamily, t.subfamily),
        ),
      );
    return;
  }
  if (!Number.isInteger(categoryId)) throw new AdminValidationError({ categoryId: "Categoría inválida" });
  const [c] = await d.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId));
  if (!c) throw new AdminNotFoundError(`Categoría ${categoryId} no encontrada`);
  await d
    .insert(categoryMappings)
    .values({ ...t, categoryId })
    .onConflictDoUpdate({
      target: [categoryMappings.metaCategory, categoryMappings.family, categoryMappings.subfamily],
      set: { categoryId },
    });
}
