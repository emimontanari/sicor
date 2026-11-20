import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "../../src/server/db";
import {
  AdminNotFoundError,
  AdminValidationError,
  createCategory,
  deleteCategory,
  listAdminCategories,
  listCategoriesWithCounts,
  renameCategory,
  setMapping,
} from "../../src/server/admin";
import { listCategories, listProducts } from "../../src/server/catalog";
import { add, setup, type Ctx } from "./helpers";

let ctx: Ctx;
let db: Ctx["db"];
beforeEach(async () => {
  ctx = await setup();
  db = ctx.db;
  await db.insert(schema.settings).values({ id: 1 });
});
afterEach(() => ctx.close());

const fieldError = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AdminValidationError);
    return (e as AdminValidationError).fields;
  }
  throw new Error("expected AdminValidationError");
};

describe("createCategory", () => {
  it("trims the name, generates an accent-free slug and appends at max sort_order + 1", async () => {
    const before = await db.select().from(schema.categories);
    const max = Math.max(...before.map((c) => c.sortOrder));
    const c = await createCategory(db, "  Señalización  Vial ñandú ");
    expect(c).toMatchObject({ name: "Señalización Vial ñandú", slug: "senalizacion-vial-nandu" });
    const [row] = await db.select().from(schema.categories).where(eq(schema.categories.id, c.id));
    expect(row.sortOrder).toBe(max + 1);
    expect((await listAdminCategories(db)).at(-1)?.id).toBe(c.id);
  });
  it("creates the first category with sort_order 1 on an empty table", async () => {
    await db.delete(schema.categories);
    const c = await createCategory(db, "Primera");
    const [row] = await db.select().from(schema.categories).where(eq(schema.categories.id, c.id));
    expect(row.sortOrder).toBe(1);
  });
  it("keeps slugs unique when two names slugify the same", async () => {
    const a = await createCategory(db, "Cascos!");
    const b = await createCategory(db, "Cascos?");
    expect(a.slug).toBe("cascos");
    expect(b.slug).toBe("cascos-2");
  });
  it("never produces an empty or reserved slug", async () => {
    expect((await createCategory(db, "!!!")).slug).toBe("categoria");
    await expect(createCategory(db, "otros")).rejects.toBeInstanceOf(AdminValidationError);
  });
  it("rejects empty, whitespace-only and >60 chars names with a Spanish message and stores nothing", async () => {
    const n = (await db.select().from(schema.categories)).length;
    expect(await fieldError(createCategory(db, "   "))).toEqual({ name: "Ingresá un nombre" });
    expect(await fieldError(createCategory(db, "x".repeat(61)))).toEqual({ name: "Máximo 60 caracteres" });
    expect(await fieldError(createCategory(db, 5 as never))).toEqual({ name: "Ingresá un nombre" });
    expect(await db.select().from(schema.categories)).toHaveLength(n);
    expect((await createCategory(db, "y".repeat(60))).name).toHaveLength(60);
  });
  it("rejects a case-insensitive duplicate name (accents significant) and stores nothing", async () => {
    const n = (await db.select().from(schema.categories)).length;
    expect(await fieldError(createCategory(db, "  SEGURIDAD VIAL "))).toEqual({ name: "Ya existe una categoría con ese nombre" });
    expect(await db.select().from(schema.categories)).toHaveLength(n);
  });
});

describe("renameCategory", () => {
  it("renames, keeps slug and sort order, and allows changing only the case of its own name", async () => {
    const [c0] = await listAdminCategories(db);
    const [before] = await db.select().from(schema.categories).where(eq(schema.categories.id, c0.id));
    const r = await renameCategory(db, c0.id, "  Ropa de trabajo ");
    expect(r).toEqual({ id: c0.id, slug: c0.slug, name: "Ropa de trabajo" });
    const [after] = await db.select().from(schema.categories).where(eq(schema.categories.id, c0.id));
    expect(after).toEqual({ ...before, name: "Ropa de trabajo" });
    expect((await renameCategory(db, c0.id, "ROPA DE TRABAJO")).name).toBe("ROPA DE TRABAJO");
  });
  it("rejects duplicates of another category and invalid names leaving the row unchanged", async () => {
    const [c0, c1] = await listAdminCategories(db);
    expect(await fieldError(renameCategory(db, c0.id, c1.name.toUpperCase()))).toEqual({ name: "Ya existe una categoría con ese nombre" });
    expect(await fieldError(renameCategory(db, c0.id, ""))).toEqual({ name: "Ingresá un nombre" });
    expect(await fieldError(renameCategory(db, c0.id, "x".repeat(61)))).toEqual({ name: "Máximo 60 caracteres" });
    expect((await listAdminCategories(db))[0].name).toBe(c0.name);
  });
  it("unknown id → AdminNotFoundError", async () => {
    await expect(renameCategory(db, 99999, "Algo")).rejects.toBeInstanceOf(AdminNotFoundError);
  });
});

describe("deleteCategory", () => {
  it("removes the category, its mappings and clears overrides; other categories' data stays", async () => {
    const [c0, c1] = await listAdminCategories(db);
    await add(db, { code: "A", metaCategory: "M", family: "F" }, { visible: true, categoryId: c0.id });
    await add(db, { code: "B", metaCategory: "M", family: "F" }, { visible: true });
    await add(db, { code: "C", metaCategory: "N", family: "G" }, { visible: true, categoryId: c1.id });
    await db.delete(schema.categoryMappings);
    await setMapping(db, { metaCategory: "M", family: "F" }, c0.id);
    await setMapping(db, { metaCategory: "N", family: "G" }, c1.id);

    expect((await listCategoriesWithCounts(db)).find((c) => c.id === c0.id)?.productCount).toBe(2);
    await deleteCategory(db, c0.id);

    expect((await listAdminCategories(db)).map((c) => c.id)).not.toContain(c0.id);
    const maps = await db.select().from(schema.categoryMappings);
    expect(maps.map((m) => m.categoryId)).toEqual([c1.id]);
    const ov = await db.select().from(schema.productOverrides);
    expect(ov.find((o) => o.productCode === "A")?.categoryId).toBeNull();
    expect(ov.find((o) => o.productCode === "C")?.categoryId).toBe(c1.id);
    expect(ov.find((o) => o.productCode === "A")?.visible).toBe(true); // other override fields untouched
  });
  it("its products resolve to «Otros» (null category) in the catalog read model", async () => {
    const [c0] = await listAdminCategories(db);
    await add(db, { code: "A", metaCategory: "M", family: "F" }, { visible: true, categoryId: c0.id });
    await add(db, { code: "B", metaCategory: "M", family: "F" }, { visible: true });
    await db.delete(schema.categoryMappings);
    await setMapping(db, { metaCategory: "M", family: "F" }, c0.id);
    expect((await listProducts({ categorySlug: c0.slug }, db as never)).map((p) => p.code).sort()).toEqual(["A", "B"]);
    await deleteCategory(db, c0.id);
    const others = await listProducts({ categorySlug: "otros" }, db as never);
    expect(others.map((p) => p.code).sort()).toEqual(["A", "B"]);
    expect(others.every((p) => p.category === null)).toBe(true);
    const cats = await listCategories(db as never);
    expect(cats.find((c) => c.slug === c0.slug)).toBeUndefined();
    expect(cats.find((c) => c.slug === "otros")?.count).toBe(2);
  });
  it("unknown id → AdminNotFoundError and nothing changes", async () => {
    const [c0] = await listAdminCategories(db);
    await add(db, { code: "A", metaCategory: "M" }, { visible: true, categoryId: c0.id });
    await setMapping(db, { metaCategory: "M" }, c0.id);
    const cats = await db.select().from(schema.categories);
    const maps = await db.select().from(schema.categoryMappings);
    await expect(deleteCategory(db, 99999)).rejects.toBeInstanceOf(AdminNotFoundError);
    expect(await db.select().from(schema.categories)).toEqual(cats);
    expect(await db.select().from(schema.categoryMappings)).toEqual(maps);
    expect((await db.select().from(schema.productOverrides))[0].categoryId).toBe(c0.id);
  });
  it("runs in one transaction: a failure after the mapping delete rolls everything back", async () => {
    const [c0] = await listAdminCategories(db);
    await setMapping(db, { metaCategory: "M" }, c0.id);
    const failing = new Proxy(db, {
      get(t, k, r) {
        if (k !== "transaction") return Reflect.get(t, k, r);
        return (fn: (tx: unknown) => Promise<unknown>) =>
          t.transaction(async (tx) =>
            fn(
              new Proxy(tx, {
                get(tt, kk, rr) {
                  if (kk === "delete")
                    return (table: unknown) => {
                      if (table === schema.categories) throw new Error("boom");
                      return (tt as typeof db).delete(table as never);
                    };
                  const v = Reflect.get(tt, kk, rr);
                  return typeof v === "function" ? v.bind(tt) : v;
                },
              }),
            ),
          );
      },
    }) as typeof db;
    await expect(deleteCategory(failing, c0.id)).rejects.toThrow("boom");
    expect((await listAdminCategories(db)).map((c) => c.id)).toContain(c0.id);
    expect((await db.select().from(schema.categoryMappings)).some((m) => m.categoryId === c0.id)).toBe(true);
  });
});

describe("listCategoriesWithCounts", () => {
  it("counts non-archived products by effective category (override wins over mapping), in sort order", async () => {
    const [c0, c1] = await listAdminCategories(db);
    await db.delete(schema.categoryMappings);
    await setMapping(db, { metaCategory: "M" }, c0.id);
    await add(db, { code: "A", metaCategory: "M" });
    await add(db, { code: "B", metaCategory: "M" }, { categoryId: c1.id });
    await add(db, { code: "C", metaCategory: "M" }, { archivedAt: new Date() });
    const rows = await listCategoriesWithCounts(db);
    expect(rows.map((r) => r.id)).toEqual((await listAdminCategories(db)).map((c) => c.id));
    expect(rows[0]).toEqual({ ...c0, productCount: 1 });
    expect(rows[1]).toEqual({ ...c1, productCount: 1 });
    expect(rows[2].productCount).toBe(0);
  });
});
