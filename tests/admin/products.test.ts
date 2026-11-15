import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { schema } from "../../src/server/db";
import {
  AdminNotFoundError,
  AdminValidationError,
  bulkUpdate,
  getAdminProduct,
  listAdminCategories,
  listAdminProducts,
  updateOverride,
} from "../../src/server/admin";
import { add, catId, setup, type Ctx } from "./helpers";

let ctx: Ctx;
let db: Ctx["db"];
beforeEach(async () => {
  ctx = await setup();
  db = ctx.db;
  await db.insert(schema.settings).values({ id: 1 });
});
afterEach(() => ctx.close());

async function seed() {
  await add(db, { code: "VIS", name: "Casco Seguridad", brand: "3M" }, { visible: true, reviewed: true });
  await add(db, { code: "HID", name: "Guante", brand: "Ansell" }, { visible: false, reviewed: true });
  await add(db, { code: "NEW1", name: "Ñandú Botín" });
  await add(db, { code: "REV", name: "Revisado sin decidir" }, { reviewed: true });
  await add(db, { code: "DIS", name: "Viejo", status: "discontinued" });
}
const codes = (r: { items: { code: string }[] }) => r.items.map((i) => i.code).sort();

describe("listAdminProducts (S3/S4)", () => {
  it("counts per filter and filters", async () => {
    await seed();
    const all = await listAdminProducts(db);
    expect(all.total).toBe(5);
    expect(all.counts).toEqual({ all: 5, visible: 2, hidden: 2, nuevos: 1, discontinued: 1 });
    expect(codes(await listAdminProducts(db, { filter: "visible" }))).toEqual(["REV", "VIS"]);
    expect(codes(await listAdminProducts(db, { filter: "hidden" }))).toEqual(["HID", "NEW1"]);
    expect(codes(await listAdminProducts(db, { filter: "nuevos" }))).toEqual(["NEW1"]);
    expect(codes(await listAdminProducts(db, { filter: "discontinued" }))).toEqual(["DIS"]);
  });
  it("auto-publish makes unreviewed products visible but still 'nuevos'", async () => {
    await seed();
    await db.update(schema.settings).set({ autoPublishNew: true });
    const r = await listAdminProducts(db, { filter: "nuevos" });
    expect(r.items[0]).toMatchObject({ code: "NEW1", visible: true, isNew: true });
  });
  it("search is accent and case insensitive on name/code/brand", async () => {
    await seed();
    expect(codes(await listAdminProducts(db, { search: "nandu" }))).toEqual(["NEW1"]);
    expect(codes(await listAdminProducts(db, { search: "ANSELL" }))).toEqual(["HID"]);
    expect(codes(await listAdminProducts(db, { search: "vis" }))).toEqual(["REV", "VIS"].filter((c) => c === "VIS" || c === "REV"));
    expect((await listAdminProducts(db, { search: "zzz" })).total).toBe(0);
  });
  it("uses effective name and exposes override + supplier name + thumbnail", async () => {
    await add(
      db,
      { code: "A", name: "Orig", localImages: ["A/0-x.jpg"] },
      { customName: "Custom", customImagePath: "custom/A/h.png", visible: true },
    );
    await add(db, { code: "B", name: "Sup", localImages: ["B/0-x.jpg"] });
    const r = await listAdminProducts(db);
    const a = r.items.find((i) => i.code === "A")!;
    expect(a).toMatchObject({ name: "Custom", supplierName: "Orig", thumbnailUrl: "/images/custom/A/h.png" });
    expect(a.override?.customName).toBe("Custom");
    expect(r.items.find((i) => i.code === "B")).toMatchObject({ thumbnailUrl: "/images/B/0-x.jpg", override: null });
  });
  it("filters by category (override, mapping and 'otros')", async () => {
    const epp = await catId(db, (await listAdminCategories(db))[0].slug);
    const cats = await listAdminCategories(db);
    await add(db, { code: "O", metaCategory: "M" }, { categoryId: cats[1].id });
    await add(db, { code: "M", metaCategory: "M", family: "F" });
    await add(db, { code: "X" });
    await db.insert(schema.categoryMappings).values({ metaCategory: "M", family: "F", subfamily: "", categoryId: epp });
    expect(codes(await listAdminProducts(db, { categorySlug: cats[1].slug }))).toEqual(["O"]);
    expect(codes(await listAdminProducts(db, { categorySlug: cats[0].slug }))).toEqual(["M"]);
    expect(codes(await listAdminProducts(db, { categorySlug: "otros" }))).toEqual(["X"]);
  });
  it("paginates, clamps the page and rejects bad filters", async () => {
    for (let i = 0; i < 7; i++) await add(db, { code: `P${i}`, name: `N${i}` });
    const p2 = await listAdminProducts(db, { page: 2, pageSize: 3 });
    expect(p2).toMatchObject({ total: 7, page: 2, pageSize: 3 });
    expect(p2.items.map((i) => i.code)).toEqual(["P3", "P4", "P5"]);
    expect((await listAdminProducts(db, { page: 99, pageSize: 3 })).items.map((i) => i.code)).toEqual(["P6"]);
    await expect(listAdminProducts(db, { filter: "bad" as never })).rejects.toBeInstanceOf(AdminValidationError);
  });
});

describe("getAdminProduct", () => {
  it("returns supplier data, override, variants and images; null when unknown", async () => {
    await add(db, { code: "A", name: "Orig", localImages: ["A/0.jpg"], supplierPrice: "10.00" }, { customImagePath: "custom/A/h.png" });
    await db.insert(schema.sourceVariants).values({ productCode: "A", sku: "S1", color: "Rojo" });
    const d = (await getAdminProduct(db, "A"))!;
    expect(d.supplier).toMatchObject({ name: "Orig", supplierPrice: "10.00", status: "active" });
    expect(d.variants).toHaveLength(1);
    expect(d.images).toEqual({ supplier: ["/images/A/0.jpg"], custom: "/images/custom/A/h.png" });
    expect(d.override?.customImagePath).toBe("custom/A/h.png");
    expect(await getAdminProduct(db, "NOPE")).toBeNull();
  });
});

describe("updateOverride (S2)", () => {
  it("trims, nulls empty strings, stores price and never touches supplier tables", async () => {
    await add(db, { code: "A", name: "Orig", supplierPrice: "5.00" });
    const beforeP = await db.select().from(schema.sourceProducts);
    const o = await updateOverride(db, "A", { customName: "  Nuevo  ", customDescription: "   ", customPrice: 12.5, showPrice: true });
    expect(o).toMatchObject({ customName: "Nuevo", customDescription: null, customPrice: "12.50", showPrice: true, visible: null, reviewed: false });
    expect(await db.select().from(schema.sourceProducts)).toEqual(beforeP);
    const o2 = await updateOverride(db, "A", { customPrice: "7" });
    expect(o2.customPrice).toBe("7.00");
    expect(o2.customName).toBe("Nuevo");
    expect((await updateOverride(db, "A", { customPrice: null })).customPrice).toBeNull();
  });
  it("marks reviewed when visible set explicitly, but not for visible:null", async () => {
    await add(db, { code: "A" });
    expect((await updateOverride(db, "A", { visible: true })).reviewed).toBe(true);
    await add(db, { code: "B" });
    expect((await updateOverride(db, "B", { visible: null })).reviewed).toBe(false);
    expect((await updateOverride(db, "B", { reviewed: true })).reviewed).toBe(true);
  });
  it("bumps updated_at", async () => {
    await add(db, { code: "A" }, { updatedAt: new Date("2020-01-01") });
    const o = await updateOverride(db, "A", { showPrice: true });
    expect(new Date(o.updatedAt).getFullYear()).toBeGreaterThan(2020);
  });
  it("validates and leaves stored data unchanged on rejection", async () => {
    await add(db, { code: "A" }, { customName: "Keep" });
    const bad: [Record<string, unknown>, string][] = [
      [{ customPrice: -1 }, "customPrice"],
      [{ customPrice: "abc" }, "customPrice"],
      [{ customPrice: NaN }, "customPrice"],
      [{ customName: "x".repeat(201) }, "customName"],
      [{ customDescription: "x".repeat(2001) }, "customDescription"],
      [{ showPrice: "yes" }, "showPrice"],
      [{ visible: "no" }, "visible"],
      [{ reviewed: null }, "reviewed"],
      [{ categoryId: 99999 }, "categoryId"],
      [{ categoryId: 1.5 }, "categoryId"],
      [{ bogus: 1 }, "bogus"],
      [{}, "patch"],
    ];
    for (const [patch, field] of bad) {
      const err = await updateOverride(db, "A", patch as never).catch((e) => e);
      expect(err, JSON.stringify(patch)).toBeInstanceOf(AdminValidationError);
      expect(Object.keys(err.fields)).toContain(field);
    }
    const [row] = await db.select().from(schema.productOverrides);
    expect(row).toMatchObject({ customName: "Keep", visible: null, showPrice: false, customPrice: null });
  });
  it("accepts an existing category and null; rejects unknown codes without creating rows", async () => {
    await add(db, { code: "A" });
    const id = await catId(db, (await listAdminCategories(db))[0].slug);
    expect((await updateOverride(db, "A", { categoryId: id })).categoryId).toBe(id);
    expect((await updateOverride(db, "A", { categoryId: null })).categoryId).toBeNull();
    await expect(updateOverride(db, "NOPE", { showPrice: true })).rejects.toBeInstanceOf(AdminNotFoundError);
    expect((await db.select().from(schema.productOverrides)).map((o) => o.productCode)).toEqual(["A"]);
  });
});

describe("bulkUpdate (S2/S4)", () => {
  it("shows/hides, sets category and reviewed for many, creating overrides", async () => {
    await add(db, { code: "A" });
    await add(db, { code: "B" }, { customName: "Keep" });
    expect(await bulkUpdate(db, ["A", "B", "A"], { visible: true })).toEqual({ updated: 2 });
    const rows = await db.select().from(schema.productOverrides);
    expect(rows.map((r) => [r.productCode, r.visible, r.reviewed]).sort()).toEqual([["A", true, true], ["B", true, true]]);
    expect(rows.find((r) => r.productCode === "B")?.customName).toBe("Keep");
    const id = await catId(db, (await listAdminCategories(db))[0].slug);
    await bulkUpdate(db, ["A"], { categoryId: id, reviewed: false });
    const a = (await db.select().from(schema.productOverrides)).find((r) => r.productCode === "A")!;
    expect(a).toMatchObject({ categoryId: id, reviewed: false, visible: true });
  });
  it("rejects more than 200 codes, empty, bad patch", async () => {
    const many = Array.from({ length: 201 }, (_, i) => `C${i}`);
    for (const c of many) await db.insert(schema.sourceProducts).values({ code: c, name: c });
    await expect(bulkUpdate(db, many, { visible: true })).rejects.toBeInstanceOf(AdminValidationError);
    expect(await db.select().from(schema.productOverrides)).toHaveLength(0);
    expect(await bulkUpdate(db, many.slice(0, 200), { visible: false })).toEqual({ updated: 200 });
    await expect(bulkUpdate(db, [], { visible: true })).rejects.toBeInstanceOf(AdminValidationError);
    await expect(bulkUpdate(db, ["C1"], {})).rejects.toBeInstanceOf(AdminValidationError);
    await expect(bulkUpdate(db, ["C1"], { visible: "x" as never })).rejects.toBeInstanceOf(AdminValidationError);
  });
  it("is atomic: an unknown code or bad category changes nothing", async () => {
    await add(db, { code: "A" });
    await expect(bulkUpdate(db, ["A", "NOPE"], { visible: true })).rejects.toBeInstanceOf(AdminNotFoundError);
    await expect(bulkUpdate(db, ["A"], { categoryId: 99999 })).rejects.toBeInstanceOf(AdminValidationError);
    expect(await db.select().from(schema.productOverrides)).toHaveLength(0);
  });
});
