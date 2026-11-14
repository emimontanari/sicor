import { sql } from "drizzle-orm";
import type { PgDb, TestDb } from "./index";
import { categories } from "./schema";

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

/** Idempotent: safe to run on every boot / migration. */
export async function seedCategories(db: PgDb | TestDb): Promise<void> {
  await db
    .insert(categories)
    .values(CATEGORIES.map((c, i) => ({ ...c, sortOrder: i + 1 })))
    .onConflictDoUpdate({
      target: categories.slug,
      set: { name: sql`excluded.name`, sortOrder: sql`excluded.sort_order` },
    });
}
