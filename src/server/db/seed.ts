import type { PgDb, TestDb } from "./index";
import { DEFAULT_CATEGORY_MAPPINGS } from "../bootstrap/category-mappings";
import { categories, categoryMappings } from "./schema";

export const CATEGORIES = [
  { slug: "indumentaria-laboral", name: "Indumentaria laboral" },
  { slug: "calzado-de-seguridad", name: "Calzado de seguridad" },
  { slug: "elementos-de-proteccion-personal", name: "Elementos de protección personal" },
  { slug: "proteccion-ocular-y-auditiva", name: "Protección ocular y auditiva" },
  { slug: "guantes-de-proteccion", name: "Guantes de protección" },
  { slug: "seguridad-vial", name: "Seguridad vial" },
  { slug: "productos-destacados", name: "Productos destacados" },
] as const;

export const CATEGORY_NAMES = CATEGORIES.map((c) => c.name);

/**
 * Idempotent and safe on every boot / deploy: seeds the defaults only while the
 * table is empty, so categories the admin renamed or deleted never come back.
 */
export async function seedCategories(db: PgDb | TestDb): Promise<{ seeded: boolean }> {
  const [existing] = await db.select({ id: categories.id }).from(categories).limit(1);
  if (existing) return { seeded: false };
  await db
    .insert(categories)
    .values(CATEGORIES.map((c, i) => ({ ...c, sortOrder: i + 1 })))
    .onConflictDoNothing({ target: categories.slug });
  return { seeded: true };
}

/**
 * Production boot step: seeds categories and, ONLY when they were seeded in this
 * call (first boot), the default Masefer family -> category mappings. Slugs that
 * do not exist are skipped. Later boots insert nothing, so admin deletions and
 * removed mappings are never resurrected.
 */
export async function seedDefaults(db: PgDb | TestDb): Promise<void> {
  const { seeded } = await seedCategories(db);
  if (!seeded) return;
  const cats = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
  const idBySlug = new Map(cats.map((c) => [c.slug, c.id]));
  const values = DEFAULT_CATEGORY_MAPPINGS.flatMap((m) => {
    const categoryId = idBySlug.get(m.categorySlug);
    return categoryId === undefined
      ? []
      : [{ metaCategory: m.metaCategory, family: m.family, subfamily: m.subfamily, categoryId }];
  });
  if (values.length > 0) await db.insert(categoryMappings).values(values).onConflictDoNothing();
}
