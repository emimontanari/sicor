import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, schema } from "../../src/server/db";
import { seedCategories } from "../../src/server/db/seed";
import {
  DEFAULT_MESSAGE_TEMPLATE,
  getProduct,
  getStorefrontSettings,
  listCategories,
  listProducts,
} from "../../src/server/catalog";

let ctx: Awaited<ReturnType<typeof createPgliteDb>>;
let db: typeof ctx.db;
const cat = async (slug: string) =>
  (await db.select().from(schema.categories)).find((c) => c.slug === slug)!.id;

beforeEach(async () => {
  ctx = await createPgliteDb();
  db = ctx.db;
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seedCategories(db);
  await db.insert(schema.settings).values({ id: 1 });
});
afterEach(async () => {
  await ctx.close();
});

type P = typeof schema.sourceProducts.$inferInsert;
type O = Omit<typeof schema.productOverrides.$inferInsert, "productCode">;
async function add(p: Partial<P> & { code: string }, o?: O) {
  await db.insert(schema.sourceProducts).values({ name: `Name ${p.code}`, ...p });
  if (o) await db.insert(schema.productOverrides).values({ productCode: p.code, ...o });
}
const shown: O = { visible: true };

/** Old-style override row: the `reviewed` column still exists and travels with every row. */
const legacyRow = (o: O): O & { reviewed: boolean } => ({ reviewed: false, ...o });

describe("visibility (publish-on-sync S1)", () => {
  it("includes a fresh synced product with no override; excludes only explicit hides and discontinued", async () => {
    await add({ code: "OK" }, shown);
    await add({ code: "HID" }, legacyRow({ visible: false }));
    await add({ code: "NEW" }); // no override row: the sync itself publishes it
    await add({ code: "DISC", status: "discontinued" }, shown);
    expect((await listProducts({}, db)).map((p) => p.code)).toEqual(["NEW", "OK"]);
    expect(await getProduct("NEW", db)).not.toBeNull();
    expect(await getProduct("OK", db)).not.toBeNull();
    for (const c of ["HID", "DISC", "NOPE"]) expect(await getProduct(c, db)).toBeNull();
  });
  it("auto_publish_new is obsolete: a no-override product is visible with the flag on or off", async () => {
    await add({ code: "NEW" });
    expect((await listProducts({}, db)).map((p) => p.code)).toEqual(["NEW"]);
    await db.update(schema.settings).set({ autoPublishNew: true });
    expect((await listProducts({}, db)).map((p) => p.code)).toEqual(["NEW"]);
  });
});

describe("effective fields (S4)", () => {
  it("override wins over supplier data", async () => {
    await add(
      { code: "A", name: "Supplier", localImages: ["A/0-x.jpg"], brand: "B", unit: "par" },
      { visible: true, customName: "Mine", customDescription: "Pack de 10", customImagePath: "custom/a.png" },
    );
    const p = (await getProduct("A", db))!;
    expect(p.name).toBe("Mine");
    expect(p.description).toBe("Pack de 10");
    expect(p.images).toEqual(["/images/custom/a.png"]);
    expect(p.brand).toBe("B");
    expect(p.unit).toBe("par");
  });
  it("falls back to supplier name/images, null description", async () => {
    await add({ code: "A", name: "Supplier", localImages: ["A/0-x.jpg", "A/1-y.jpg"] }, shown);
    const p = (await getProduct("A", db))!;
    expect(p.name).toBe("Supplier");
    expect(p.description).toBeNull();
    expect(p.images).toEqual(["/images/A/0-x.jpg", "/images/A/1-y.jpg"]);
    expect(p.category).toBeNull();
  });
  it("never exposes supplier image URLs", async () => {
    await add({ code: "A", supplierImages: ["https://dropbox.com/x.jpg"] }, shown);
    expect((await getProduct("A", db))!.images).toEqual([]);
  });
  it("variants: published only, distinct colors/sizes", async () => {
    await add({ code: "A" }, shown);
    await db.insert(schema.sourceVariants).values([
      { productCode: "A", sku: "1", color: "Rojo", size: "40" },
      { productCode: "A", sku: "2", color: "Rojo", size: "42" },
      { productCode: "A", sku: "3", color: "Azul", size: null },
      { productCode: "A", sku: "4", color: "Negro", size: "44", published: false },
    ]);
    const p = (await getProduct("A", db))!;
    expect(p.colors.sort()).toEqual(["Azul", "Rojo"]);
    expect(p.sizes).toEqual(["40", "42"]);
    expect(p.variants).toHaveLength(3);
  });
});

describe("category resolution (S5)", () => {
  it("override category beats mappings", async () => {
    const calzado = await cat("calzado-de-seguridad");
    const vial = await cat("seguridad-vial");
    await db.insert(schema.categoryMappings).values({ metaCategory: "M", categoryId: vial });
    await add({ code: "A", metaCategory: "M" }, { visible: true, categoryId: calzado });
    expect((await getProduct("A", db))!.category?.slug).toBe("calzado-de-seguridad");
  });
  it("most specific mapping wins; wildcard '' matches any", async () => {
    const [a, b, c] = [await cat("seguridad-vial"), await cat("guantes-de-proteccion"), await cat("indumentaria-laboral")];
    await db.insert(schema.categoryMappings).values([
      { metaCategory: "M", categoryId: a },
      { metaCategory: "M", family: "F", categoryId: b },
      { metaCategory: "M", family: "F", subfamily: "S", categoryId: c },
    ]);
    await add({ code: "P1", metaCategory: "M", family: "F", subfamily: "S" }, shown);
    await add({ code: "P2", metaCategory: "M", family: "F", subfamily: "Z" }, shown);
    await add({ code: "P3", metaCategory: "M", family: "X" }, shown);
    await add({ code: "P4", metaCategory: "Q" }, shown);
    const slug = async (code: string) => (await getProduct(code, db))!.category?.slug ?? null;
    expect(await slug("P1")).toBe("indumentaria-laboral");
    expect(await slug("P2")).toBe("guantes-de-proteccion");
    expect(await slug("P3")).toBe("seguridad-vial");
    expect(await slug("P4")).toBeNull();
  });
});

describe("listCategories (S5)", () => {
  it("returns the 7 in order with visible counts and an Otros bucket", async () => {
    const vial = await cat("seguridad-vial");
    await add({ code: "A" }, { visible: true, categoryId: vial });
    await add({ code: "B" }, { visible: true, categoryId: vial });
    await add({ code: "H" }, { visible: false, categoryId: vial });
    await add({ code: "N" }, shown);
    const list = await listCategories(db);
    expect(list).toHaveLength(8);
    expect(list.slice(0, 7).map((c) => c.name)[0]).toBe("Indumentaria laboral");
    expect(list.find((c) => c.slug === "seguridad-vial")!.count).toBe(2);
    expect(list[7]).toMatchObject({ slug: "otros", name: "Otros productos", count: 1 });
  });
  it("omits Otros when every visible product is categorised", async () => {
    const vial = await cat("seguridad-vial");
    await add({ code: "A" }, { visible: true, categoryId: vial });
    // S1: a no-override product is visible, so it must be categorised to keep Otros empty.
    await add({ code: "N" }, { categoryId: vial });
    const list = await listCategories(db);
    expect(list).toHaveLength(7);
    expect(list.every((c) => c.slug !== "otros")).toBe(true);
  });
  it("listProducts filters by category slug incl. otros", async () => {
    const vial = await cat("seguridad-vial");
    await add({ code: "A" }, { visible: true, categoryId: vial });
    await add({ code: "N" }, shown);
    expect((await listProducts({ categorySlug: "seguridad-vial" }, db)).map((p) => p.code)).toEqual(["A"]);
    expect((await listProducts({ categorySlug: "otros" }, db)).map((p) => p.code)).toEqual(["N"]);
  });
});

describe("price gating (S2)", () => {
  const setup = async (showPrices: boolean, showPrice: boolean) => {
    await db.update(schema.settings).set({ showPrices });
    await add({ code: "A", supplierPrice: "10.00" }, { visible: true, customPrice: "99.50", showPrice });
  };
  it("null by default", async () => {
    await add({ code: "A", supplierPrice: "10.00" }, { visible: true, customPrice: "99.50" });
    expect((await getProduct("A", db))!.price).toBeNull();
  });
  it("null unless both flags are on", async () => {
    await setup(true, false);
    expect((await getProduct("A", db))!.price).toBeNull();
  });
  it("null when only override flag is on", async () => {
    await setup(false, true);
    expect((await getProduct("A", db))!.price).toBeNull();
  });
  it("custom price when both on; never the supplier price when absent", async () => {
    await setup(true, true);
    expect((await getProduct("A", db))!.price).toBe("99.50");
    await db.update(schema.productOverrides).set({ customPrice: null });
    expect((await getProduct("A", db))!.price).toBeNull();
    expect(JSON.stringify(await getProduct("A", db))).not.toContain("10.00");
  });
});

describe("search", () => {
  it("is case/accent-insensitive over effective name, brand, code", async () => {
    await add({ code: "BOT-1", name: "Botín", brand: "Pampero" }, shown);
    await add({ code: "X2", name: "Casco" }, { visible: true, customName: "Protección Ocular" });
    await add({ code: "HID", name: "Botín oculto" }, { visible: false });
    const codes = async (s: string) => (await listProducts({ search: s }, db)).map((p) => p.code);
    expect(await codes("BOTIN")).toEqual(["BOT-1"]);
    expect(await codes("pampero")).toEqual(["BOT-1"]);
    expect(await codes("bot-1")).toEqual(["BOT-1"]);
    expect(await codes("proteccion")).toEqual(["X2"]);
    expect(await codes("casco")).toEqual([]);
    expect(await codes("  ")).toHaveLength(2);
  });
});

describe("getStorefrontSettings", () => {
  const prev = process.env.WHATSAPP_NUMBER;
  afterEach(() => {
    if (prev === undefined) delete process.env.WHATSAPP_NUMBER;
    else process.env.WHATSAPP_NUMBER = prev;
  });
  it("uses the settings row first", async () => {
    process.env.WHATSAPP_NUMBER = "111";
    await db.update(schema.settings).set({ whatsappNumber: "5493510000000", messageTemplate: "Hola" });
    expect(await getStorefrontSettings(db)).toEqual({ whatsappNumber: "5493510000000", messageTemplate: "Hola" });
  });
  it("falls back to env number and default template", async () => {
    process.env.WHATSAPP_NUMBER = "222";
    expect(await getStorefrontSettings(db)).toEqual({ whatsappNumber: "222", messageTemplate: DEFAULT_MESSAGE_TEMPLATE });
  });
  it("number is null when neither is set; works with no settings row", async () => {
    delete process.env.WHATSAPP_NUMBER;
    await db.delete(schema.settings);
    expect(await getStorefrontSettings(db)).toEqual({ whatsappNumber: null, messageTemplate: DEFAULT_MESSAGE_TEMPLATE });
  });
});

describe("documents (S1, S2, S4)", () => {
  it("exposes only local documents as /docs urls, with hasFicha", async () => {
    await add(
      {
        code: "ZAP13",
        supplierDocuments: [{ kind: "ficha", label: "Ficha técnica", url: "https://dropbox.com/f.pdf" }],
        localDocuments: [
          { kind: "ficha", label: "Ficha técnica", path: "docs/ZAP13/0-abc.pdf" },
          { kind: "certificacion", label: "Licencia IRAM", path: "docs/ZAP13/1-def.pdf" },
        ],
      },
      shown,
    );
    await add({ code: "SNEAKPRO" }, shown);
    await add({ code: "CERTONLY", localDocuments: [{ kind: "certificacion", label: "ISP", path: "docs/CERTONLY/0-a.pdf" }] }, shown);
    await add({ code: "REMOTE", supplierDocuments: [{ kind: "ficha", label: "Ficha técnica", url: "https://dropbox.com/r.pdf" }] }, shown);
    const z = (await getProduct("ZAP13", db))!;
    expect(z.hasFicha).toBe(true);
    expect(z.documents).toEqual([
      { kind: "ficha", label: "Ficha técnica", url: "/docs/ZAP13/0-abc.pdf?n=ZAP13-Ficha%20t%C3%A9cnica" },
      { kind: "certificacion", label: "Licencia IRAM", url: "/docs/ZAP13/1-def.pdf?n=ZAP13-Licencia%20IRAM" },
    ]);
    const s = (await getProduct("SNEAKPRO", db))!;
    expect(s.hasFicha).toBe(false);
    expect(s.documents).toEqual([]);
    expect((await getProduct("CERTONLY", db))!.hasFicha).toBe(false);
    const r = (await getProduct("REMOTE", db))!;
    expect(r.hasFicha).toBe(false);
    expect(JSON.stringify(r)).not.toContain("dropbox");
  });

  it("does not make hidden products visible", async () => {
    await add({ code: "H", localDocuments: [{ kind: "ficha", label: "Ficha técnica", path: "docs/H/0-a.pdf" }] }, { visible: false, reviewed: true });
    expect(await getProduct("H", db)).toBeNull();
  });
});
