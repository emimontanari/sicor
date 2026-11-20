import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, schema } from "../../src/server/db";
import { seedDefaults } from "../../src/server/db/seed";
import { DEFAULT_CATEGORY_MAPPINGS } from "../../src/server/bootstrap/category-mappings";

let ctx: Awaited<ReturnType<typeof createPgliteDb>>;
beforeEach(async () => {
  ctx = await createPgliteDb();
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
});
afterEach(() => ctx.close());

const mappings = () => ctx.db.select().from(schema.categoryMappings);
const cats = () => ctx.db.select().from(schema.categories);

describe("seedDefaults (production boot)", () => {
  it("first boot seeds 7 categories and every default mapping", async () => {
    await seedDefaults(ctx.db);
    expect(await cats()).toHaveLength(7);
    const rows = await mappings();
    expect(rows).toHaveLength(DEFAULT_CATEGORY_MAPPINGS.length);
    const byId = new Map((await cats()).map((c) => [c.id, c.slug]));
    const first = DEFAULT_CATEGORY_MAPPINGS[0]!;
    expect(rows.some((r) => r.family === first.family && r.subfamily === first.subfamily && byId.get(r.categoryId) === first.categorySlug)).toBe(true);
  });

  it("second boot adds nothing", async () => {
    await seedDefaults(ctx.db);
    await seedDefaults(ctx.db);
    expect(await cats()).toHaveLength(7);
    expect(await mappings()).toHaveLength(DEFAULT_CATEGORY_MAPPINGS.length);
  });

  it("does not recreate a deleted category nor its mappings", async () => {
    await seedDefaults(ctx.db);
    await ctx.db.delete(schema.categories).where(eq(schema.categories.slug, "seguridad-vial"));
    await seedDefaults(ctx.db);
    expect(await cats()).toHaveLength(6);
    const expected = DEFAULT_CATEGORY_MAPPINGS.filter((m) => m.categorySlug !== "seguridad-vial").length;
    expect(await mappings()).toHaveLength(expected);
  });

  it("does not resurrect mappings the admin removed", async () => {
    await seedDefaults(ctx.db);
    await ctx.db.delete(schema.categoryMappings);
    await seedDefaults(ctx.db);
    expect(await mappings()).toHaveLength(0);
  });

  it("existing categories with an empty mappings table: mappings are not inserted", async () => {
    await ctx.db.insert(schema.categories).values({ slug: "seguridad-vial", name: "Seguridad vial", sortOrder: 1 });
    await seedDefaults(ctx.db);
    expect(await cats()).toHaveLength(1);
    expect(await mappings()).toHaveLength(0);
  });
});
