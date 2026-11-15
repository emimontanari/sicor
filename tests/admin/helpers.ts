import { migrate } from "drizzle-orm/pglite/migrator";
import { createPgliteDb, schema } from "../../src/server/db";
import { seedCategories } from "../../src/server/db/seed";

export async function setup() {
  const ctx = await createPgliteDb();
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  await seedCategories(ctx.db);
  return ctx;
}
export type Ctx = Awaited<ReturnType<typeof setup>>;

type P = typeof schema.sourceProducts.$inferInsert;
type O = Omit<typeof schema.productOverrides.$inferInsert, "productCode">;
export async function add(db: Ctx["db"], p: Partial<P> & { code: string }, o?: O) {
  await db.insert(schema.sourceProducts).values({ name: `Name ${p.code}`, ...p });
  if (o) await db.insert(schema.productOverrides).values({ productCode: p.code, ...o });
}
export const catId = async (db: Ctx["db"], slug: string) =>
  (await db.select().from(schema.categories)).find((c) => c.slug === slug)!.id;
