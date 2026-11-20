import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, schema } from "../../src/server/db";
import { CATEGORY_NAMES, seedCategories } from "../../src/server/db/seed";

let ctx: Awaited<ReturnType<typeof createPgliteDb>>;
beforeEach(async () => {
  ctx = await createPgliteDb();
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
});
afterEach(() => ctx.close());

describe("seedCategories (runs on every deploy)", () => {
  it("seeds the 7 defaults on an empty database", async () => {
    await seedCategories(ctx.db);
    const rows = await ctx.db.select().from(schema.categories);
    expect(rows.map((r) => r.name).sort()).toEqual([...CATEGORY_NAMES].sort());
  });
  it("does not resurrect a deleted category on the next deploy", async () => {
    await seedCategories(ctx.db);
    await ctx.db.delete(schema.categories).where(eq(schema.categories.slug, "seguridad-vial"));
    await seedCategories(ctx.db);
    const rows = await ctx.db.select().from(schema.categories);
    expect(rows).toHaveLength(6);
    expect(rows.some((r) => r.slug === "seguridad-vial")).toBe(false);
  });
  it("does not revert a rename nor add duplicates on the next deploy", async () => {
    await seedCategories(ctx.db);
    await ctx.db.update(schema.categories).set({ name: "Ropa", sortOrder: 99 }).where(eq(schema.categories.slug, "indumentaria-laboral"));
    await seedCategories(ctx.db);
    const rows = await ctx.db.select().from(schema.categories);
    expect(rows).toHaveLength(7);
    expect(rows.find((r) => r.slug === "indumentaria-laboral")).toMatchObject({ name: "Ropa", sortOrder: 99 });
  });
});
