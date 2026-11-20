import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, schema } from "../../src/server/db";
import type { SupplierCatalog, SupplierProduct } from "../../src/server/masefer";
import { createSyncEngine } from "../../src/server/sync";

let ctx: Awaited<ReturnType<typeof createPgliteDb>>;
const product = (code: string, over: Partial<SupplierProduct> = {}): SupplierProduct => ({
  code,
  name: `Product ${code}`,
  description: null,
  brand: "Brand",
  brandId: 1,
  metaCategory: "Meta",
  family: "Fam",
  subfamily: "Sub",
  unit: "UN",
  supplierPrice: 10,
  currency: "ARS",
  images: { small: [], large: [] },
  variants: [{ sku: `${code}-R`, color: "Rojo", size: "M", text: "", stockTotal: 3, published: true }],
  ...over,
});
const catalog = (...products: SupplierProduct[]): SupplierCatalog => ({
  metaCategories: [],
  categories: [],
  brands: [],
  products,
});
let next: SupplierCatalog = catalog();
let engine: ReturnType<typeof createSyncEngine>;

beforeEach(async () => {
  ctx = await createPgliteDb();
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  let t = Date.parse("2026-01-01T00:00:00Z");
  engine = createSyncEngine({
    db: ctx.db,
    source: { fetchCatalog: async () => structuredClone(next) },
    imageStore: { save: async (i: { code: string; index: number }) => `${i.code}/${i.index}.jpg` },
    clock: () => new Date((t += 1000)),
  });
});
afterEach(() => ctx.close());

describe("sync ignores archived codes (S3)", () => {
  it("never re-proposes, re-inserts or changes an archived code; override survives", async () => {
    next = catalog(product("A"), product("B"));
    await engine.apply((await engine.check("manual")).id);
    const archivedAt = new Date("2026-02-02T00:00:00Z");
    await ctx.db.insert(schema.productOverrides).values({ productCode: "A", archivedAt, customName: "Mi A" });
    const srcBefore = await ctx.db.select().from(schema.sourceProducts).where(eq(schema.sourceProducts.code, "A"));
    const ovBefore = await ctx.db.select().from(schema.productOverrides);

    // upstream changes A and adds C; archived A must not be proposed
    next = catalog(product("A", { name: "Upstream renamed A" }), product("B"), product("C"));
    const run = await engine.check("scheduled");
    expect(run.changes).toEqual([{ type: "new", code: "C", name: "Product C" }]);
    await engine.apply(run.id);

    // even when A disappears upstream
    next = catalog(product("B"), product("C"));
    const run2 = await engine.check("manual");
    expect(run2.status).not.toBe("pending");
    expect(run2.summary).toEqual({ new: 0, changed: 0, removed: 0 });
    expect(run2.changes).toEqual([]);
    expect(await engine.getPendingRun()).toBeNull();

    expect(await ctx.db.select().from(schema.sourceProducts).where(eq(schema.sourceProducts.code, "A"))).toEqual(srcBefore);
    expect(await ctx.db.select().from(schema.productOverrides)).toEqual(ovBefore);
    expect((await ctx.db.select().from(schema.sourceProducts)).map((p) => p.code).sort()).toEqual(["A", "B", "C"]);
  });
});
