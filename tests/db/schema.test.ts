import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, schema } from "../../src/server/db";
import { seedCategories, CATEGORY_NAMES } from "../../src/server/db/seed";

let ctx: Awaited<ReturnType<typeof createPgliteDb>>;

beforeEach(async () => {
  ctx = await createPgliteDb();
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
});
afterEach(async () => {
  await ctx.close();
});

const product = (code: string) => ({ code, name: `P ${code}` });

describe("schema migrations", () => {
  it("creates all tables", async () => {
    const res = await ctx.db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const names = res.rows.map((r) => r.table_name);
    for (const t of [
      "categories",
      "source_products",
      "source_variants",
      "product_overrides",
      "category_mappings",
      "settings",
      "sync_runs",
    ]) {
      expect(names).toContain(t);
    }
  });

  it("seeds the 7 categories idempotently", async () => {
    await seedCategories(ctx.db);
    await seedCategories(ctx.db);
    const rows = await ctx.db.select().from(schema.categories);
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.name).sort()).toEqual([...CATEGORY_NAMES].sort());
  });

  it("rejects duplicate product code and variant sku", async () => {
    await ctx.db.insert(schema.sourceProducts).values(product("A1"));
    await expect(
      ctx.db.insert(schema.sourceProducts).values(product("A1")),
    ).rejects.toThrow();
    await ctx.db
      .insert(schema.sourceVariants)
      .values({ productCode: "A1", sku: "S1" });
    await expect(
      ctx.db.insert(schema.sourceVariants).values({ productCode: "A1", sku: "S1" }),
    ).rejects.toThrow();
  });

  it("applies defaults: quote-only overrides, status, sync run", async () => {
    await ctx.db.insert(schema.sourceProducts).values(product("A1"));
    await ctx.db.insert(schema.productOverrides).values({ productCode: "A1" });
    const [o] = await ctx.db.select().from(schema.productOverrides);
    expect(o.visible).toBeNull();
    expect(o.showPrice).toBe(false);
    expect(o.reviewed).toBe(false);
    const [p] = await ctx.db.select().from(schema.sourceProducts);
    expect(p.status).toBe("active");
    await ctx.db
      .insert(schema.syncRuns)
      .values({ trigger: "manual", status: "checking" });
    const [r] = await ctx.db.select().from(schema.syncRuns);
    expect(r.startedAt).toBeInstanceOf(Date);
  });

  it("rejects an override for an unknown product", async () => {
    await expect(
      ctx.db.insert(schema.productOverrides).values({ productCode: "NOPE" }),
    ).rejects.toThrow();
  });
});
