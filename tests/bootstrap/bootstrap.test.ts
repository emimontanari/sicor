import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrapCatalog } from "../../src/server/bootstrap";
import { listProducts } from "../../src/server/catalog/read";
import { DEFAULT_CATEGORY_MAPPINGS } from "../../src/server/bootstrap/category-mappings";
import { PDF_PRODUCTS } from "../../src/server/bootstrap/pdf-products";
import { CATEGORIES, seedCategories } from "../../src/server/db/seed";
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
  it("seeds categories, mappings, applies sync and publishes every active product without mass-override rows (S1)", async () => {
    const r = await bootstrapCatalog(deps());
    expect((await ctx.db.select().from(schema.categories)).length).toBe(CATEGORIES.length);
    expect((await ctx.db.select().from(schema.categoryMappings)).length).toBe(DEFAULT_CATEGORY_MAPPINGS.length);
    expect((await ctx.db.select().from(schema.sourceProducts)).length).toBe(3);
    const cats = await ctx.db.select().from(schema.categories);
    const ind = cats.find((c) => c.slug === "indumentaria-laboral")!;
    // Only the PDF products get an override (their curated category + note); publication
    // itself no longer needs override rows: the default is visible (publish-on-sync S1).
    const rows = await overrides();
    expect(rows.map((o) => o.productCode).sort()).toEqual([noNote.code, withNote.code].sort());
    const a = rows.find((o) => o.productCode === withNote.code)!;
    expect(a).toMatchObject({ visible: null, categoryId: ind.id, customDescription: withNote.note });
    const b = rows.find((o) => o.productCode === noNote.code)!;
    expect(b).toMatchObject({ visible: null, categoryId: ind.id, customDescription: null });
    expect(r.published).toBe(3);
    expect(r.alreadyHidden).toBe(0);
    expect((await listProducts({}, ctx.db)).map((p) => p.code).sort()).toEqual([noNote.code, withNote.code, "OTHER"].sort());
    expect(r.unmatched).toContain(PDF_PRODUCTS.find((p) => ![withNote.code, noNote.code].includes(p.code))!.code);
  });

  it("skips default mappings and PDF products whose category the admin deleted (no crash, nothing resurrected)", async () => {
    await seedCategories(ctx.db);
    const gone = "indumentaria-laboral";
    await ctx.db.delete(schema.categories).where(eq(schema.categories.slug, gone));
    const r = await bootstrapCatalog(deps());
    const cats = await ctx.db.select().from(schema.categories);
    expect(cats.map((c) => c.slug).sort()).toEqual(CATEGORIES.map((c) => c.slug).filter((s) => s !== gone).sort());
    const maps = await ctx.db.select().from(schema.categoryMappings);
    const expected = DEFAULT_CATEGORY_MAPPINGS.filter((m) => m.categorySlug !== gone);
    expect(expected.length).toBeLessThan(DEFAULT_CATEGORY_MAPPINGS.length);
    expect(maps).toHaveLength(expected.length);
    const idBySlug = new Map(cats.map((c) => [c.slug, c.id]));
    expect(maps.map((m) => m.categoryId).sort()).toEqual(expected.map((m) => idBySlug.get(m.categorySlug)!).sort());
    // PDF products pointing at the deleted category get no override row.
    const pdfOfGone = PDF_PRODUCTS.filter((p) => p.categorySlug === gone).map((p) => p.code);
    expect((await overrides()).filter((o) => pdfOfGone.includes(o.productCode))).toEqual([]);
    expect(r.published).toBe(3);
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
    // publish-on-sync S1: visible stays null (the default publishes); only category/note are filled.
    expect(o).toMatchObject({ customName: "Renamed", visible: null });
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

  it("keeps admin-hidden products hidden and counts them (rerun never un-hides, S1)", async () => {
    await bootstrapCatalog(deps());
    // S1 removed the mass-override insert, so the admin hide is the product's only override row.
    await ctx.db.insert(schema.productOverrides).values({ productCode: "OTHER", visible: false });
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

  it("leaves a null visible untouched (default-visible) and never mass-inserts overrides (S1)", async () => {
    await bootstrapCatalog(deps());
    await ctx.db
      .update(schema.productOverrides)
      .set({ visible: null, reviewed: false, customName: "X" })
      .where(eq(schema.productOverrides.productCode, withNote.code));
    await bootstrapCatalog(deps());
    // no visible=true is forced anymore: null means visible and must survive a rerun
    expect((await overrides()).find((o) => o.productCode === withNote.code)).toMatchObject({ visible: null, customName: "X" });
    expect((await overrides()).map((o) => o.productCode).sort()).toEqual([noNote.code, withNote.code].sort());
  });

  it("skips PDF codes missing from the supplier catalog without failing", async () => {
    const r = await bootstrapCatalog({ ...deps(), source: source(product("OTHER")) });
    // No PDF product exists, so no override row is created at all; OTHER publishes by default (S1).
    expect((await overrides()).map((o) => o.productCode)).toEqual([]);
    expect(r.published).toBe(1);
    expect(r.unmatched.length).toBe(PDF_PRODUCTS.length);
  });
});
