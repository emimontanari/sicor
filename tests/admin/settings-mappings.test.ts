import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { schema } from "../../src/server/db";
import {
  AdminNotFoundError,
  AdminValidationError,
  getSettings,
  listAdminCategories,
  listMappings,
  setMapping,
  updateSettings,
} from "../../src/server/admin";
import { add, setup, type Ctx } from "./helpers";

let ctx: Ctx;
let db: Ctx["db"];
beforeEach(async () => {
  ctx = await setup();
  db = ctx.db;
});
afterEach(() => ctx.close());

describe("settings (S6)", () => {
  it("returns defaults with no row, then upserts id=1", async () => {
    expect(await getSettings(db)).toEqual({ whatsappNumber: null, messageTemplate: null, autoPublishNew: false, showPrices: false });
    const s = await updateSettings(db, { whatsappNumber: "+54 9 11 1234-5678", messageTemplate: "  Hola  ", autoPublishNew: true });
    expect(s).toEqual({ whatsappNumber: "5491112345678", messageTemplate: "Hola", autoPublishNew: true, showPrices: false });
    await updateSettings(db, { showPrices: true });
    expect(await getSettings(db)).toMatchObject({ whatsappNumber: "5491112345678", showPrices: true, autoPublishNew: true });
    expect(await db.select().from(schema.settings)).toHaveLength(1);
  });
  it("clears number/template with null or empty", async () => {
    await updateSettings(db, { whatsappNumber: "12345678", messageTemplate: "x" });
    expect(await updateSettings(db, { whatsappNumber: "", messageTemplate: null })).toMatchObject({ whatsappNumber: null, messageTemplate: null });
  });
  it("rejects invalid values and leaves stored settings unchanged", async () => {
    await updateSettings(db, { whatsappNumber: "12345678" });
    const bad = [
      { whatsappNumber: "1234567" },
      { whatsappNumber: "1".repeat(16) },
      { whatsappNumber: "12ab5678" },
      { whatsappNumber: 12345678 },
      { messageTemplate: "x".repeat(501) },
      { autoPublishNew: "true" },
      { showPrices: 1 },
      { other: true },
    ];
    for (const p of bad) await expect(updateSettings(db, p as never), JSON.stringify(p)).rejects.toBeInstanceOf(AdminValidationError);
    expect((await getSettings(db)).whatsappNumber).toBe("12345678");
    expect((await updateSettings(db, { messageTemplate: "x".repeat(500) })).messageTemplate).toHaveLength(500);
  });
});

describe("category mappings (S7)", () => {
  it("lists distinct triples with counts, mapping and effective category", async () => {
    const [c0, c1] = await listAdminCategories(db);
    await add(db, { code: "1", metaCategory: "M", family: "F", subfamily: "S" });
    await add(db, { code: "2", metaCategory: "M", family: "F", subfamily: "S" });
    await add(db, { code: "3", metaCategory: "M", family: "F", subfamily: "T" });
    await add(db, { code: "4" });
    await setMapping(db, { metaCategory: "M", family: "F" }, c0.id);
    await setMapping(db, { metaCategory: "M", family: "F", subfamily: "S" }, c1.id);
    const rows = await listMappings(db);
    expect(rows).toHaveLength(3);
    const get = (s: string) => rows.find((r) => r.subfamily === s)!;
    expect(get("S")).toMatchObject({ productCount: 2, mappedCategory: c1, effectiveCategory: c1 });
    expect(get("T")).toMatchObject({ productCount: 1, mappedCategory: null, effectiveCategory: c0 });
    expect(rows.find((r) => r.metaCategory === "")).toMatchObject({ productCount: 1, effectiveCategory: null });
  });
  it("upserts (no duplicates), deletes with null, validates", async () => {
    const [c0, c1] = await listAdminCategories(db);
    const t = { metaCategory: "M", family: "F", subfamily: "" };
    await setMapping(db, t, c0.id);
    await setMapping(db, { ...t, family: " F " }, c1.id);
    const rows = await db.select().from(schema.categoryMappings);
    expect(rows).toHaveLength(1);
    expect(rows[0].categoryId).toBe(c1.id);
    await setMapping(db, t, null);
    expect(await db.select().from(schema.categoryMappings)).toHaveLength(0);
    await setMapping(db, t, null); // idempotent
    await expect(setMapping(db, t, 99999)).rejects.toBeInstanceOf(AdminNotFoundError);
    await expect(setMapping(db, {}, c0.id)).rejects.toBeInstanceOf(AdminValidationError);
    expect(await db.select().from(schema.categoryMappings)).toHaveLength(0);
  });
});
