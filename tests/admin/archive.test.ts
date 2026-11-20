import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { schema } from "../../src/server/db";
import {
  AdminNotFoundError,
  AdminValidationError,
  MAX_BULK,
  archiveProducts,
  getAdminProduct,
  listAdminProducts,
  restoreProducts,
} from "../../src/server/admin";
import { getProduct, listCategories, listProducts } from "../../src/server/catalog";
import { add, catId, setup, type Ctx } from "./helpers";

let ctx: Ctx;
let db: Ctx["db"];
beforeEach(async () => {
  ctx = await setup();
  db = ctx.db;
  await db.insert(schema.settings).values({ id: 1 });
});
afterEach(() => ctx.close());

const codes = (r: { items: { code: string }[] }) => r.items.map((i) => i.code).sort();
const strip = <T extends { archivedAt: Date | null; updatedAt: Date }>({ archivedAt, updatedAt, ...rest }: T) =>
  (void archivedAt, void updatedAt, rest);
const overrides = () => db.select().from(schema.productOverrides).orderBy(schema.productOverrides.productCode);

async function seed() {
  const cascos = await catId(db, "seguridad-vial");
  await add(
    db,
    { code: "A", name: "Casco" },
    {
      visible: true,
      reviewed: true,
      customName: "Casco Pro",
      customDescription: "desc",
      customPrice: "123.45",
      showPrice: true,
      customImagePath: "custom/A/h.png",
      categoryId: cascos,
    },
  );
  await add(db, { code: "B", name: "Guante" }, { visible: true, reviewed: true });
  await add(db, { code: "N", name: "Nuevo" });
  await add(db, { code: "D", name: "Viejo", status: "discontinued" });
}

describe("archiveProducts / restoreProducts (S3)", () => {
  it("archive hides from public catalog and default admin list, shows only in eliminados", async () => {
    await seed();
    expect((await listProducts({}, db)).map((p) => p.code).sort()).toEqual(["A", "B"]);
    const res = await archiveProducts(db, ["A", "N"]);
    expect(res).toEqual({ updated: 2 });

    expect((await listProducts({}, db)).map((p) => p.code)).toEqual(["B"]);
    expect(await getProduct("A", db)).toBeNull();
    expect((await listProducts({ search: "casco" }, db))).toEqual([]);
    const cats = await listCategories(db);
    expect(cats.reduce((n, c) => n + c.count, 0)).toBe(1);

    const def = await listAdminProducts(db);
    expect(codes(def)).toEqual(["B", "D"]);
    expect(def.counts).toEqual({ all: 2, visible: 1, hidden: 0, nuevos: 0, discontinued: 1, eliminados: 2 });
    expect(codes(await listAdminProducts(db, { filter: "visible" }))).toEqual(["B"]);
    expect(codes(await listAdminProducts(db, { filter: "nuevos" }))).toEqual([]);
    const el = await listAdminProducts(db, { filter: "eliminados" });
    expect(codes(el)).toEqual(["A", "N"]);
    expect(el.total).toBe(2);
    expect(el.counts.eliminados).toBe(2);
    expect(el.items.find((i) => i.code === "A")?.override?.visible).toBe(true);
    expect((await getAdminProduct(db, "A"))?.archivedAt).toEqual(expect.any(String));
    expect((await getAdminProduct(db, "B"))?.archivedAt).toBeNull();
    // supplier row is never deleted
    expect(await db.select().from(schema.sourceProducts)).toHaveLength(4);
  });

  it("archived stays hidden even when override is visible and auto-publish is on", async () => {
    await seed();
    await db.update(schema.settings).set({ autoPublishNew: true });
    await archiveProducts(db, ["A", "N"]);
    expect((await listProducts({}, db)).map((p) => p.code)).toEqual(["B"]);
  });

  it("restore returns it with previous fields intact and byte-for-byte other override fields", async () => {
    await seed();
    const before = (await overrides()).find((o) => o.productCode === "A")!;
    await archiveProducts(db, ["A"]);
    const archived = (await overrides()).find((o) => o.productCode === "A")!;
    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect(archived.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
    const rest = strip(archived);
    const rest0 = strip(before);
    expect(rest).toEqual(rest0);

    expect(await restoreProducts(db, ["A"])).toEqual({ updated: 1 });
    const after = (await overrides()).find((o) => o.productCode === "A")!;
    expect(after.archivedAt).toBeNull();
    const rest2 = strip(after);
    expect(rest2).toEqual(rest0);
    const p = await getProduct("A", db);
    expect(p).toMatchObject({ name: "Casco Pro", price: null, category: { slug: "seguridad-vial" } });
    expect(p?.images).toHaveLength(1);
    expect(codes(await listAdminProducts(db, { filter: "eliminados" }))).toEqual([]);
    expect(codes(await listAdminProducts(db))).toContain("A");
  });

  it("creates an override row when missing and restore keeps it unreviewed/null visible", async () => {
    await seed();
    await archiveProducts(db, ["N"]);
    const o = (await overrides()).find((x) => x.productCode === "N")!;
    expect(o).toMatchObject({ visible: null, reviewed: false, showPrice: false });
    await restoreProducts(db, ["N"]);
    expect((await overrides()).find((x) => x.productCode === "N")).toMatchObject({
      archivedAt: null,
      visible: null,
      reviewed: false,
    });
  });

  it("rejects unknown code without changing anything (both operations)", async () => {
    await seed();
    const snap = JSON.stringify(await overrides());
    await expect(archiveProducts(db, ["A", "NOPE"])).rejects.toBeInstanceOf(AdminNotFoundError);
    expect(JSON.stringify(await overrides())).toBe(snap);
    await archiveProducts(db, ["B"]);
    const snap2 = JSON.stringify(await overrides());
    await expect(restoreProducts(db, ["B", "NOPE"])).rejects.toBeInstanceOf(AdminNotFoundError);
    expect(JSON.stringify(await overrides())).toBe(snap2);
  });

  it("validates codes and bounds bulk size", async () => {
    await seed();
    const snap = JSON.stringify(await overrides());
    await expect(archiveProducts(db, [])).rejects.toBeInstanceOf(AdminValidationError);
    await expect(archiveProducts(db, [""])).rejects.toBeInstanceOf(AdminValidationError);
    const many = Array.from({ length: MAX_BULK + 1 }, (_, i) => `X${i}`);
    await expect(archiveProducts(db, many)).rejects.toBeInstanceOf(AdminValidationError);
    await expect(restoreProducts(db, many)).rejects.toBeInstanceOf(AdminValidationError);
    expect(JSON.stringify(await overrides())).toBe(snap);
  });

  it("rejects an invalid filter value but accepts eliminados", async () => {
    await expect(listAdminProducts(db, { filter: "x" as never })).rejects.toBeInstanceOf(AdminValidationError);
    expect((await listAdminProducts(db, { filter: "eliminados" })).total).toBe(0);
  });

  it("archive is idempotent for the stored flag's presence", async () => {
    await seed();
    await archiveProducts(db, ["B"]);
    await archiveProducts(db, ["B"]);
    const [o] = await db.select().from(schema.productOverrides).where(eq(schema.productOverrides.productCode, "B"));
    expect(o.archivedAt).toBeInstanceOf(Date);
  });
});
