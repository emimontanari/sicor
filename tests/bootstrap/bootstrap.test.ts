import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrapCatalog } from "../../src/server/bootstrap";
import { listProducts } from "../../src/server/catalog/read";
import { DEFAULT_CATEGORY_MAPPINGS } from "../../src/server/bootstrap/category-mappings";
import { PDF_PRODUCTS } from "../../src/server/bootstrap/pdf-products";
import { CATEGORIES } from "../../src/server/db/seed";
import { createPgliteDb, schema } from "../../src/server/db";
import type { SupplierCatalog, SupplierProduct } from "../../src/server/masefer";
import type { ImageStore } from "../../src/server/sync";

let ctx: Awaited<ReturnType<typeof createPgliteDb>>;

function product(code: string, over: Partial<SupplierProduct> = {}): SupplierProduct {
  return {
    code,
    name: `Product ${code}`,
    description: null,
    brand: "B",
    brandId: 1,
    metaCategory: "Indumentaria",
    family: "ROPA DE TRABAJO",
    subfamily: "JEANS",
    unit: "UN",
    supplierPrice: 1,
    currency: "ARS",
    images: { small: [], large: [] },
    variants: [],
    ...over,
  };
}
const source = (...products: SupplierProduct[]) => ({
  async fetchCatalog(): Promise<SupplierCatalog> {
    return structuredClone({ metaCategories: [], categories: [], brands: [], products });
  },
});
const imageStore: ImageStore = { save: async (i) => `${i.code}/${i.index}.jpg` };

const withNote = PDF_PRODUCTS.find((p) => p.note?.includes("PACK"))!;
const noNote = PDF_PRODUCTS.find((p) => p.note === null)!;
const deps = (...extra: SupplierProduct[]) => ({
  db: ctx.db,
  source: source(product(withNote.code), product(noNote.code), product("OTHER"), ...extra),
  imageStore,
});
const overrides = () => ctx.db.select().from(schema.productOverrides);

beforeEach(async () => {
  ctx = await createPgliteDb();
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
});
afterEach(async () => {
  await ctx.close();
});

describe("bootstrapCatalog (S8)", () => {
  it("seeds categories, mappings, applies sync and publishes every active product", async () => {
    const r = await bootstrapCatalog(deps());
    expect((await ctx.db.select().from(schema.categories)).length).toBe(CATEGORIES.length);
    expect((await ctx.db.select().from(schema.categoryMappings)).length).toBe(DEFAULT_CATEGORY_MAPPINGS.length);
    expect((await ctx.db.select().from(schema.sourceProducts)).length).toBe(3);
    const cats = await ctx.db.select().from(schema.categories);
    const ind = cats.find((c) => c.slug === "indumentaria-laboral")!;
    const rows = await overrides();
    expect(rows.map((o) => o.productCode).sort()).toEqual([noNote.code, withNote.code, "OTHER"].sort());
    expect(rows.find((o) => o.productCode === "OTHER")).toMatchObject({ visible: true, reviewed: true, categoryId: null, customDescription: null });
    const a = rows.find((o) => o.productCode === withNote.code)!;
    expect(a).toMatchObject({ visible: true, reviewed: true, categoryId: ind.id, customDescription: withNote.note });
    const b = rows.find((o) => o.productCode === noNote.code)!;
    expect(b).toMatchObject({ visible: true, reviewed: true, categoryId: ind.id, customDescription: null });
    expect(r.published).toBe(3);
    expect(r.alreadyHidden).toBe(0);
    expect((await listProducts({}, ctx.db)).map((p) => p.code).sort()).toEqual([noNote.code, withNote.code, "OTHER"].sort());
    expect(r.unmatched).toContain(PDF_PRODUCTS.find((p) => ![withNote.code, noNote.code].includes(p.code))!.code);
  });

  it("never maps anything to productos-destacados", () => {
    expect(DEFAULT_CATEGORY_MAPPINGS.some((m) => (m.categorySlug as string) === "productos-destacados")).toBe(false);
  });

  it("is idempotent", async () => {
    await bootstrapCatalog(deps());
    const before = JSON.stringify({
      o: (await overrides()).map((o) => ({ ...o, updatedAt: null })),
      m: await ctx.db.select().from(schema.categoryMappings),
      p: (await ctx.db.select().from(schema.sourceProducts)).length,
    });
    await bootstrapCatalog(deps());
    const after = JSON.stringify({
      o: (await overrides()).map((o) => ({ ...o, updatedAt: null })),
      m: await ctx.db.select().from(schema.categoryMappings),
      p: (await ctx.db.select().from(schema.sourceProducts)).length,
    });
    expect(after).toBe(before);
  });

  it("a rerun keeps curation but does not read the supplier or auto-import once initialized", async () => {
    await bootstrapCatalog(deps());
    let reads = 0;
    const next = { async fetchCatalog() { reads++; return source(product("NEW")).fetchCatalog(); } };
    const r = await bootstrapCatalog({ ...deps(), source: next });
    expect(r).toMatchObject({ appliedRunId: null, published: 3 });
    expect(reads).toBe(0);
    expect(await ctx.db.select().from(schema.sourceProducts)).toHaveLength(3);
  });

  it("never overwrites fields the admin already set", async () => {
    await bootstrapCatalog(deps());
    const cats = await ctx.db.select().from(schema.categories);
    const guantes = cats.find((c) => c.slug === "guantes-de-proteccion")!;
    await ctx.db
      .update(schema.productOverrides)
      .set({ visible: false, categoryId: guantes.id, customDescription: "mine" })
      .where(eq(schema.productOverrides.productCode, withNote.code));
    await bootstrapCatalog(deps());
    const o = (await overrides()).find((x) => x.productCode === withNote.code)!;
    expect(o).toMatchObject({ visible: false, categoryId: guantes.id, customDescription: "mine" });
  });

  it("fills only null fields of an existing override and keeps custom data", async () => {
    await bootstrapCatalog(deps());
    await ctx.db.delete(schema.productOverrides);
    await ctx.db.insert(schema.productOverrides).values({ productCode: noNote.code, customName: "Renamed" });
    await bootstrapCatalog(deps());
    const o = (await overrides()).find((x) => x.productCode === noNote.code)!;
    expect(o).toMatchObject({ customName: "Renamed", visible: true, reviewed: true });
    expect(o.categoryId).not.toBeNull();
  });

  it("keeps an admin-changed mapping", async () => {
    await bootstrapCatalog(deps());
    const cats = await ctx.db.select().from(schema.categories);
    const first = DEFAULT_CATEGORY_MAPPINGS[0]!;
    const other = cats.find((c) => c.slug !== first.categorySlug && c.slug !== "productos-destacados")!;
    await ctx.db
      .update(schema.categoryMappings)
      .set({ categoryId: other.id })
      .where(eq(schema.categoryMappings.subfamily, first.subfamily));
    await bootstrapCatalog(deps());
    const rows = await ctx.db.select().from(schema.categoryMappings);
    expect(rows.length).toBe(DEFAULT_CATEGORY_MAPPINGS.length);
    expect(rows.find((r) => r.subfamily === first.subfamily && r.family === first.family)!.categoryId).toBe(other.id);
  });

  it("keeps admin-hidden products hidden and counts them", async () => {
    await bootstrapCatalog(deps());
    await ctx.db.update(schema.productOverrides).set({ visible: false }).where(eq(schema.productOverrides.productCode, "OTHER"));
    const r = await bootstrapCatalog(deps());
    expect((await overrides()).find((o) => o.productCode === "OTHER")!.visible).toBe(false);
    expect(r).toMatchObject({ published: 2, alreadyHidden: 1 });
  });

  it("does not publish discontinued products", async () => {
    await bootstrapCatalog(deps());
    await ctx.db.delete(schema.productOverrides);
    // A catalog predating append-only sync can already contain discontinued rows.
    await ctx.db.update(schema.sourceProducts).set({ status: "discontinued" }).where(eq(schema.sourceProducts.code, "OTHER"));
    const r = await bootstrapCatalog(deps());
    expect((await ctx.db.select().from(schema.sourceProducts)).find((p) => p.code === "OTHER")!.status).toBe("discontinued");
    expect((await overrides()).map((o) => o.productCode)).not.toContain("OTHER");
    expect(r.published).toBe(2);
  });

  it("fills a null visible on a non-PDF override", async () => {
    await bootstrapCatalog(deps());
    await ctx.db.update(schema.productOverrides).set({ visible: null, reviewed: false, customName: "X" }).where(eq(schema.productOverrides.productCode, "OTHER"));
    await bootstrapCatalog(deps());
    expect((await overrides()).find((o) => o.productCode === "OTHER")).toMatchObject({ visible: true, reviewed: true, customName: "X" });
  });

  it("skips PDF codes missing from the supplier catalog without failing", async () => {
    const r = await bootstrapCatalog({ ...deps(), source: source(product("OTHER")) });
    expect((await overrides()).map((o) => o.productCode)).toEqual(["OTHER"]);
    expect(r.published).toBe(1);
    expect(r.unmatched.length).toBe(PDF_PRODUCTS.length);
  });
});
