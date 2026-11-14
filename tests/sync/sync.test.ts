import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, schema } from "../../src/server/db";
import { effectiveVisibility } from "../../src/server/db/effective";
import { MaseferSyncError } from "../../src/server/masefer";
import type { SupplierCatalog, SupplierProduct } from "../../src/server/masefer";
import { createSyncEngine, type ImageStore } from "../../src/server/sync";

let ctx: Awaited<ReturnType<typeof createPgliteDb>>;

function product(code: string, over: Partial<SupplierProduct> = {}): SupplierProduct {
  return {
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
    images: { small: [`https://dl/${code}-s.jpg`], large: [`https://dl/${code}-a.jpg`, `https://dl/${code}-b.jpg`] },
    variants: [
      { sku: `${code}-R`, color: "Rojo", size: "M", text: "", stockTotal: 3, published: true },
      { sku: `${code}-A`, color: "Azul", size: "L", text: "", stockTotal: 0, published: true },
    ],
    ...over,
  };
}
const catalog = (...products: SupplierProduct[]): SupplierCatalog => ({
  metaCategories: [],
  categories: [],
  brands: [],
  products,
});

class FakeSource {
  next: SupplierCatalog | Error = catalog();
  async fetchCatalog() {
    if (this.next instanceof Error) throw this.next;
    return structuredClone(this.next);
  }
}
class FakeImages implements ImageStore {
  fail = false;
  calls: string[] = [];
  async save(input: { code: string; index: number; url: string }) {
    if (this.fail) throw new Error("disk full");
    this.calls.push(input.url);
    return `${input.code}/${input.index}.jpg`;
  }
}

let source: FakeSource;
let images: FakeImages;
let engine: ReturnType<typeof createSyncEngine>;

beforeEach(async () => {
  ctx = await createPgliteDb();
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  source = new FakeSource();
  images = new FakeImages();
  let t = Date.parse("2026-01-01T00:00:00Z");
  engine = createSyncEngine({
    db: ctx.db,
    source,
    imageStore: images,
    clock: () => new Date((t += 1000)),
  });
});
afterEach(async () => {
  await ctx.close();
});

const products = () => ctx.db.select().from(schema.sourceProducts).orderBy(schema.sourceProducts.code);
const variants = () => ctx.db.select().from(schema.sourceVariants);
const runs = () => ctx.db.select().from(schema.syncRuns).orderBy(schema.syncRuns.id);

async function seedBase() {
  source.next = catalog(product("A"), product("B"), product("C"));
  const run = await engine.check("manual");
  await engine.apply(run.id);
}

describe("sync engine", () => {
  it("1: first check is pending with all new and writes nothing to source tables (S4)", async () => {
    source.next = catalog(product("A"), product("B"));
    const run = await engine.check("scheduled");
    expect(run.status).toBe("pending");
    expect(run.trigger).toBe("scheduled");
    expect(run.summary).toEqual({ new: 2, changed: 0, removed: 0 });
    expect(run.changes).toEqual([
      { type: "new", code: "A", name: "Product A" },
      { type: "new", code: "B", name: "Product B" },
    ]);
    expect(await products()).toEqual([]);
    expect(await variants()).toEqual([]);
    expect((await engine.getPendingRun())?.id).toBe(run.id);
  });

  it("2: apply inserts products, variants, local images; new products hidden unless auto_publish_new (S5, S6)", async () => {
    source.next = catalog(product("A"));
    const run = await engine.check("manual");
    const applied = await engine.apply(run.id);
    expect(applied.status).toBe("applied");
    expect(applied.appliedAt).toBeInstanceOf(Date);
    const [p] = await products();
    expect(p.status).toBe("active");
    expect(p.localImages).toEqual(["A/0.jpg", "A/1.jpg"]);
    expect(p.supplierImages).toEqual(["https://dl/A-a.jpg", "https://dl/A-b.jpg"]);
    expect(p.supplierPrice).toBe("10.00");
    expect(p.contentHash).toBeTruthy();
    expect((await variants()).map((v) => v.sku).sort()).toEqual(["A-A", "A-R"]);
    expect(await ctx.db.select().from(schema.productOverrides)).toEqual([]);
    expect(effectiveVisibility(p, null, { autoPublishNew: false })).toBe(false);
    expect(effectiveVisibility(p, null, { autoPublishNew: true })).toBe(true);
    expect(await engine.getPendingRun()).toBeNull();
  });

  it("3: second check reports exact new/changed/removed", async () => {
    await seedBase();
    source.next = catalog(product("A"), product("B", { name: "Renamed B" }), product("D"));
    const run = await engine.check("manual");
    expect(run.status).toBe("pending");
    expect(run.summary).toEqual({ new: 1, changed: 1, removed: 1 });
    expect(run.changes).toEqual([
      { type: "new", code: "D", name: "Product D" },
      { type: "changed", code: "B", name: "Renamed B", fields: ["name"] },
      { type: "removed", code: "C", name: "Product C" },
    ]);
  });

  it("3b: variant and image changes are detected", async () => {
    await seedBase();
    const a = product("A");
    a.variants[0].stockTotal = 99;
    a.images.large = ["https://dl/new.jpg"];
    source.next = catalog(a, product("B"), product("C"));
    const run = await engine.check("manual");
    expect(run.changes).toEqual([
      { type: "changed", code: "A", name: "Product A", fields: ["images", "variants"] },
    ]);
  });

  it("4: apply preserves product_overrides byte-for-byte (S2)", async () => {
    await seedBase();
    await ctx.db.insert(schema.productOverrides).values({
      productCode: "B",
      visible: true,
      customName: "Mi nombre",
      customPrice: "123.45",
      showPrice: true,
      customImagePath: "custom/b.png",
      reviewed: true,
    });
    const [before] = await ctx.db.select().from(schema.productOverrides);
    source.next = catalog(product("A"), product("B", { name: "Renamed B", supplierPrice: 55 }), product("C"));
    const run = await engine.check("manual");
    await engine.apply(run.id);
    const after = await ctx.db.select().from(schema.productOverrides);
    expect(after).toEqual([before]);
    const [b] = await ctx.db.select().from(schema.sourceProducts).where(eq(schema.sourceProducts.code, "B"));
    expect(b.name).toBe("Renamed B");
    expect(b.supplierPrice).toBe("55.00");
  });

  it("5: removed products become discontinued, never deleted, override kept (S5)", async () => {
    await seedBase();
    await ctx.db.insert(schema.productOverrides).values({ productCode: "C", visible: true, customName: "Keep" });
    source.next = catalog(product("A"), product("B"));
    const run = await engine.check("manual");
    await engine.apply(run.id);
    const all = await products();
    expect(all.map((p) => [p.code, p.status])).toEqual([
      ["A", "active"],
      ["B", "active"],
      ["C", "discontinued"],
    ]);
    const [ov] = await ctx.db.select().from(schema.productOverrides);
    expect(ov.customName).toBe("Keep");
    expect(effectiveVisibility(all[2], ov, { autoPublishNew: true })).toBe(false);
    // already-discontinued product is not reported as removed again
    const again = await engine.check("manual");
    expect(again.summary).toEqual({ new: 0, changed: 0, removed: 0 });
  });

  it("6: discard changes no data; discarded/applied runs cannot be applied", async () => {
    source.next = catalog(product("A"));
    const run = await engine.check("manual");
    const discarded = await engine.discard(run.id);
    expect(discarded.status).toBe("discarded");
    expect(await products()).toEqual([]);
    await expect(engine.apply(run.id)).rejects.toThrow(/pending/);
    await expect(engine.discard(run.id)).rejects.toThrow(/pending/);

    const run2 = await engine.check("manual");
    await engine.apply(run2.id);
    await expect(engine.apply(run2.id)).rejects.toThrow(/pending/);
    expect(await products()).toHaveLength(1);
  });

  it("7: source failure records a failed run and leaves data unchanged (S7)", async () => {
    await seedBase();
    const before = await products();
    source.next = new MaseferSyncError("timeout", "no response");
    const run = await engine.check("scheduled");
    expect(run.status).toBe("failed");
    expect(run.error).toContain("no response");
    expect(await products()).toEqual(before);
    expect(await engine.getPendingRun()).toBeNull();
    const last = await engine.getLastRuns(1);
    expect(last[0].id).toBe(run.id);
  });

  it("8: image store failure during apply fails the run, DB untouched (S6, S7)", async () => {
    await seedBase();
    const before = await products();
    const beforeVariants = await variants();
    source.next = catalog(product("A", { name: "New A" }), product("B"), product("C"), product("D"));
    const run = await engine.check("manual");
    images.fail = true;
    const res = await engine.apply(run.id);
    expect(res.status).toBe("failed");
    expect(res.error).toContain("disk full");
    expect(await products()).toEqual(before);
    expect(await variants()).toEqual(beforeVariants);
  });

  it("8b: DB error mid-apply rolls back everything", async () => {
    await seedBase();
    const before = await products();
    // D's variant sku collides with existing sku of A -> unique violation after D's product insert
    source.next = catalog(
      product("A"),
      product("B"),
      product("C"),
      product("D", { variants: [{ sku: "A-R", color: "", size: "", text: "", stockTotal: 1, published: true }] }),
    );
    const run = await engine.check("manual");
    const res = await engine.apply(run.id);
    expect(res.status).toBe("failed");
    expect(await products()).toEqual(before);
  });

  it("9: a new check supersedes an older pending run", async () => {
    source.next = catalog(product("A"));
    const r1 = await engine.check("manual");
    source.next = catalog(product("A"), product("B"));
    const r2 = await engine.check("manual");
    const all = await runs();
    expect(all.find((r) => r.id === r1.id)?.status).toBe("discarded");
    expect(all.filter((r) => r.status === "pending").map((r) => r.id)).toEqual([r2.id]);
    await expect(engine.apply(r1.id)).rejects.toThrow(/pending/);
  });

  it("10: check with no changes leaves no pending run", async () => {
    await seedBase();
    const run = await engine.check("manual");
    expect(run.status).toBe("discarded");
    expect(run.summary).toEqual({ new: 0, changed: 0, removed: 0 });
    expect(await engine.getPendingRun()).toBeNull();
  });

  it("11: second apply after a successful apply is rejected and leaves data unchanged", async () => {
    source.next = catalog(product("A"));
    const run = await engine.check("manual");
    await engine.apply(run.id);
    const p = await products();
    const v = await variants();
    const savedCalls = images.calls.length;
    await expect(engine.apply(run.id)).rejects.toThrow(/pending/);
    expect(await products()).toEqual(p);
    expect(await variants()).toEqual(v);
    expect(images.calls.length).toBe(savedCalls);
    expect((await runs())[0].status).toBe("applied");
  });

  it("12: two concurrent apply() calls yield exactly one success; run stays applied", async () => {
    source.next = catalog(product("A"), product("B"));
    const run = await engine.check("manual");
    const results = await Promise.allSettled([engine.apply(run.id), engine.apply(run.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(String((rejected[0] as PromiseRejectedResult).reason)).toMatch(/pending/);
    expect(await products()).toHaveLength(2);
    expect(await variants()).toHaveLength(4);
    const [r] = await runs();
    expect(r.status).toBe("applied");
    expect(r.error).toBeNull();
  });
});
