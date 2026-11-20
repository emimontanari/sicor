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

type EngineDb = Parameters<typeof createSyncEngine>[0]["db"];

/**
 * Wraps the db so every syncRuns UPDATE that sets status='discarded' is paused
 * BEFORE executing; release() lets it run. This deterministically widens the
 * read/update race window inside the engine (loadPending or supersedePending's
 * select run, then another caller finalizes the run, then the paused update
 * executes). `paused()` counts updates currently waiting on the gate.
 */
function pauseDiscardedRunUpdates(db: EngineDb) {
  let releaseGate!: () => void;
  const gate = new Promise<void>((r) => (releaseGate = r));
  let pausedUpdates = 0;
  const pauseChain = (node: object): object =>
    new Proxy(node, {
      get(target: never, prop: string | symbol) {
        const t = target as Record<string | symbol, unknown>;
        if (prop === "returning") {
          return (...args: unknown[]) => {
            pausedUpdates++;
            return {
              then: (res: unknown, rej: unknown) =>
                gate.then(() =>
                  (t.returning as (...a: unknown[]) => Promise<unknown>)(...args).then(res as never, rej as never),
                ),
            };
          };
        }
        if (prop === "then") {
          return (res: unknown, rej: unknown) => {
            pausedUpdates++;
            gate.then(() => (t.then as (a: unknown, b: unknown) => unknown)(res, rej));
          };
        }
        const value = Reflect.get(t, prop, t);
        return typeof value === "function"
          ? (...args: unknown[]) => pauseChain((value as (...a: unknown[]) => object).apply(t, args))
          : value;
      },
    });
  const proxy = new Proxy(db as object, {
    get(target, prop) {
      const t = target as Record<string | symbol, unknown>;
      const value = Reflect.get(t, prop, t);
      if (prop === "update") {
        return (table: unknown) => {
          const builder = (value as (tbl: unknown) => object).call(t, table);
          if (table !== schema.syncRuns) return builder;
          return new Proxy(builder, {
            get(b, prop2) {
              const bt = b as Record<string | symbol, unknown>;
              const v2 = Reflect.get(bt, prop2, bt);
              if (prop2 !== "set") return typeof v2 === "function" ? (v2 as (...a: unknown[]) => unknown).bind(bt) : v2;
              return (values: { status?: string }) => {
                const next = (v2 as (v: unknown) => object).call(bt, values);
                return values.status === "discarded" ? pauseChain(next) : next;
              };
            },
          });
        };
      }
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(t) : value;
    },
  });
  return { db: proxy as EngineDb, release: () => releaseGate(), paused: () => pausedUpdates };
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

  it("2: apply inserts products, variants, local images; new products are published by default with no override row (publish-on-sync S1)", async () => {
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
    // append-only sync never writes overrides; the flipped default publishes the product (S1).
    expect(await ctx.db.select().from(schema.productOverrides)).toEqual([]);
    expect(effectiveVisibility(p, null)).toBe(true);
    expect(await engine.getPendingRun()).toBeNull();
  });

  it("3: manual check reports only newly seen codes, once each", async () => {
    await seedBase();
    source.next = catalog(product("A"), product("B", { name: "Renamed B" }), product("D"), product("D"));
    const run = await engine.check("manual");
    expect(run.status).toBe("pending");
    expect(run.summary).toEqual({ new: 1, changed: 0, removed: 0 });
    expect(run.changes).toEqual([{ type: "new", code: "D", name: "Product D" }]);
  });

  it("3b: scheduled check ignores changes to variants and images", async () => {
    await seedBase();
    const a = product("A");
    a.variants[0].stockTotal = 99;
    a.images.large = ["https://dl/new.jpg"];
    source.next = catalog(a, product("B"), product("C"));
    const run = await engine.check("scheduled");
    expect(run).toMatchObject({ status: "discarded", changes: [], summary: { new: 0, changed: 0, removed: 0 } });
  });

  it("confirmation of a legacy payload only inserts still-absent additions and leaves existing data byte-for-byte", async () => {
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
    const beforeOverrides = await ctx.db.select().from(schema.productOverrides);
    const beforeProducts = await products();
    const beforeVariants = await variants();
    const [run] = await ctx.db.insert(schema.syncRuns).values({
      trigger: "manual", status: "pending", startedAt: new Date(),
      summary: { new: 2, changed: 1, removed: 1 },
      changes: [
        { type: "new", code: "D" }, { type: "new", code: "B" },
        { type: "changed", code: "GONE" }, { type: "removed", code: "C" },
      ],
      payload: { products: [product("D"), product("B", { supplierPrice: 55 }), product("GONE")], removed: ["C"], unchanged: ["A"] },
    }).returning();
    images.calls.length = 0;
    const applied = await engine.apply(run.id);
    expect(applied).toMatchObject({ status: "applied", summary: { new: 1, changed: 0, removed: 0 }, changes: [{ type: "new", code: "D" }] });
    expect(await products()).toEqual([...beforeProducts, expect.objectContaining({ code: "D" })]);
    expect((await variants()).filter((v) => v.productCode !== "D")).toEqual(beforeVariants);
    expect(await ctx.db.select().from(schema.productOverrides)).toEqual(beforeOverrides);
    expect(images.calls).toEqual(["https://dl/D-a.jpg", "https://dl/D-b.jpg"]);
  });

  it("5: missing and previously discontinued codes are left untouched even when another code is confirmed", async () => {
    await seedBase();
    await ctx.db.update(schema.sourceProducts).set({ status: "discontinued" }).where(eq(schema.sourceProducts.code, "B"));
    const before = await products();
    source.next = catalog(product("A"), product("B"), product("D"));
    const run = await engine.check("manual");
    expect(await products()).toEqual(before);
    await engine.apply(run.id);
    expect(await products()).toEqual([...before, expect.objectContaining({ code: "D" })]);
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

  it("6b: apply committing between discard's pending read and its update cannot overwrite the applied run", async () => {
    // R3-003: discard reads the run as pending, then apply commits before
    // discard's update executes. The update must not overwrite the applied run.
    const { db: gatedDb, release } = pauseDiscardedRunUpdates(ctx.db);
    const gated = createSyncEngine({ db: gatedDb, source, imageStore: images, clock: () => new Date() });
    source.next = catalog(product("A"));
    const run = await engine.check("manual"); // pending, created before the gate is used
    const discarding = gated.discard(run.id); // passes its pending read; its update is paused
    const applied = await gated.apply(run.id); // commits inside the window
    expect(applied.status).toBe("applied");
    release();
    await expect(discarding).rejects.toThrow(/pending/);
    const [r] = await runs();
    expect(r.status).toBe("applied");
    expect(r.appliedAt).toBeInstanceOf(Date);
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

  it("8: a failing image is skipped with a warning; the run still applies (S6)", async () => {
    await seedBase();
    source.next = catalog(product("A"), product("B"), product("C"), product("D"));
    const run = await engine.check("manual");
    images.fail = true;
    const res = await engine.apply(run.id);
    expect(res.status).toBe("applied");
    const d = (await products()).find((p) => p.code === "D")!;
    expect(d.localImages).toEqual([]);
    expect(d.supplierImages).toHaveLength(2);
    const summary = res.summary as unknown as { new: number; imageWarnings: number; imageWarningList: unknown[] };
    expect(summary.new).toBe(1);
    expect(summary.imageWarnings).toBe(2);
    expect(summary.imageWarningList[0]).toEqual({ code: "D", url: "https://dl/D-a.jpg", reason: "disk full" });
  });

  it("8c: one bad asset keeps the good image of the same product, with a warning", async () => {
    source.next = catalog(product("A"));
    const run = await engine.check("manual");
    const orig = images.save.bind(images);
    images.save = async (i) => {
      if (i.url.endsWith("-a.jpg")) throw new Error('Unexpected content-type "video/mp4"');
      return orig(i);
    };
    const res = await engine.apply(run.id);
    expect(res.status).toBe("applied");
    const [p] = await products();
    expect(p.localImages).toEqual(["A/1.jpg"]); // deterministic index of the surviving image
    const summary = res.summary as unknown as { imageWarnings: number; imageWarningList: { code: string; reason: string }[] };
    expect(summary.imageWarnings).toBe(1);
    expect(summary.imageWarningList).toEqual([
      { code: "A", url: "https://dl/A-a.jpg", reason: 'Unexpected content-type "video/mp4"' },
    ]);
  });

  it("8d: warning list is bounded to 50 while the count is exact", async () => {
    source.next = catalog(
      ...Array.from({ length: 30 }, (_, i) => product(`P${String(i).padStart(2, "0")}`)),
    );
    const run = await engine.check("manual");
    images.fail = true;
    const res = await engine.apply(run.id);
    const summary = res.summary as unknown as { imageWarnings: number; imageWarningList: unknown[] };
    expect(summary.imageWarnings).toBe(60);
    expect(summary.imageWarningList).toHaveLength(50);
  });

  it("8e: image downloads respect the concurrency limit", async () => {
    source.next = catalog(...Array.from({ length: 10 }, (_, i) => product(`Q${i}`)));
    const run = await engine.check("manual");
    let inFlight = 0;
    let max = 0;
    images.save = async (i) => {
      inFlight++;
      max = Math.max(max, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return `${i.code}/${i.index}.jpg`;
    };
    const limited = createSyncEngine({ db: ctx.db, source, imageStore: images, imageConcurrency: 3 });
    const res = await limited.apply(run.id);
    expect(res.status).toBe("applied");
    expect(max).toBe(3);
    expect((await products()).every((p) => p.localImages.length === 2)).toBe(true);
  });

  it("8b: DB error mid-apply rolls back everything", async () => {
    await seedBase();
    const before = await products();
    const beforeVariants = await variants();
    // AA is inserted first; D then fails at the DB (price overflows numeric(14,2)).
    source.next = catalog(
      product("AA"),
      product("B"),
      product("C"),
      product("D", { supplierPrice: 1e20 }),
    );
    const run = await engine.check("manual");
    const res = await engine.apply(run.id);
    expect(res.status).toBe("failed");
    expect(await products()).toEqual(before);
    expect(await variants()).toEqual(beforeVariants);
  });

  it("9: overlapping proposals and no-change checks preserve each pending run, with truthful confirmation counts", async () => {
    await seedBase();
    source.next = catalog(product("D"), product("E"));
    const r1 = await engine.check("manual");
    source.next = catalog(product("F"), product("D"));
    const r2 = await engine.check("scheduled");
    source.next = catalog(product("A"));
    expect((await engine.check("manual")).status).toBe("discarded");
    expect((await runs()).filter((r) => r.status === "pending").map((r) => r.id)).toEqual([r1.id, r2.id]);
    expect((await engine.apply(r2.id)).summary).toMatchObject({ new: 2 });
    expect((await engine.getPendingRun())?.id).toBe(r1.id);
    expect((await engine.apply(r1.id))).toMatchObject({ status: "applied", summary: { new: 1 }, changes: [{ code: "E" }] });
    expect((await products()).map((p) => p.code)).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  it("records zero inserted when all confirmed codes were inserted by another run", async () => {
    source.next = catalog(product("A"));
    const first = await engine.check("manual");
    const second = await engine.check("scheduled");
    await engine.apply(first.id);
    expect(await engine.apply(second.id)).toMatchObject({ status: "applied", summary: { new: 0 }, changes: [] });
  });

  it("does not repair other products automatically when applying; explicit repair still works", async () => {
    source.next = catalog(product("A"));
    images.fail = true;
    await engine.apply((await engine.check("manual")).id);
    images.fail = false;
    source.next = catalog(product("A"), product("B"));
    await engine.apply((await engine.check("manual")).id);
    expect((await products())[0].localImages).toEqual([]);
    expect(await engine.repairAssets()).toMatchObject({ repaired: 2 });
    expect((await products())[0].localImages).toEqual(["A/0.jpg", "A/1.jpg"]);
  });

  it("9b: a late-finishing older check cannot discard a newer pending run (newest wins)", async () => {
    // R3-002: the older check starts first but is slow; the newer check completes
    // while the older one is still fetching. When the older check finishes late
    // it runs the same supersede step check() always runs (exceptId = its own id)
    // and must not drop the newer pending run.
    const stale = catalog(product("A"));
    const fresh = catalog(product("A"), product("B"));
    let release!: () => void;
    const slowFetch = new Promise<void>((r) => (release = r));
    let firstCall = true;
    source.fetchCatalog = async () => {
      if (!firstCall) return structuredClone(fresh);
      firstCall = false;
      await slowFetch;
      return structuredClone(stale);
    };
    const late = engine.check("manual"); // run 1: slow, older
    const newer = await engine.check("manual"); // run 2: finishes first
    expect(newer.status).toBe("pending");
    release();
    const older = await late; // run 1 finishes late and supersedes
    expect(older.status).toBe("pending");
    const all = await runs();
    expect(all.find((r) => r.id === newer.id)?.status).toBe("pending");
    expect((await engine.getPendingRun())?.id).toBe(newer.id);
  });

  it("9c: supersede never touches applied, failed, or discarded runs", async () => {
    // R3-003: a newer check pauses inside its supersede update; while it is
    // paused, the older pending run is applied underneath. Releasing the update
    // must not overwrite that (or any other non-pending) run.
    source.next = new MaseferSyncError("timeout", "no response");
    await engine.check("scheduled"); // failed run
    source.next = catalog(product("A"));
    const d = await engine.check("manual");
    await engine.discard(d.id); // discarded run
    const p = await engine.check("manual"); // pending run P
    const { db: gatedDb, release, paused } = pauseDiscardedRunUpdates(ctx.db);
    const gated = createSyncEngine({ db: gatedDb, source, imageStore: images, clock: () => new Date() });
    const newer = gated.check("manual"); // reaches its supersede step and pauses there
    while (paused() < 1) {
      await ctx.db.select().from(schema.sourceProducts).limit(1);
    }
    const applied = await engine.apply(p.id); // commits while the supersede update is paused
    expect(applied.status).toBe("applied");
    release();
    const done = await newer;
    expect(done.status).toBe("pending");
    const all = await runs();
    expect(all.find((r) => r.id === p.id)?.status).toBe("applied");
    expect(all.find((r) => r.id === d.id)?.status).toBe("discarded");
    expect(all.filter((r) => r.status === "failed")).toHaveLength(1);
    expect((await engine.getPendingRun())?.id).toBe(done.id);
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

  it("13: a loser failing in the image phase after the winner committed cannot overwrite the applied run", async () => {
    source.next = catalog(product("A"));
    const run = await engine.check("manual");
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let first = true;
    let blockedResolve!: () => void;
    const blocked = new Promise<void>((r) => (blockedResolve = r));
    images.save = async (input) => {
      if (first) {
        first = false;
        blockedResolve();
        await gate;
        throw new Error("late image failure");
      }
      return `${input.code}/${input.index}.jpg`;
    };
    const loser = engine.apply(run.id);
    const loserResult = loser.then(
      () => "ok",
      (e: Error) => e.message,
    );
    await blocked;
    const winner = await engine.apply(run.id);
    expect(winner.status).toBe("applied");
    release();
    expect(await loserResult).toMatch(/pending/);
    const [r] = await runs();
    expect(r.status).toBe("applied");
    expect(r.error).toBeNull();
    expect(await products()).toHaveLength(1);
  });

  it("14: the same SKU under two products (or duplicated in one) applies successfully", async () => {
    const dup = { sku: "SHARED", color: "x", size: "", text: "", stockTotal: 1, published: true };
    source.next = catalog(
      product("A", { variants: [dup, { ...dup, color: "dup" }] }),
      product("B", { variants: [dup] }),
    );
    const run = await engine.check("manual");
    const res = await engine.apply(run.id);
    expect(res.status).toBe("applied");
    const v = await variants();
    expect(v.map((x) => [x.productCode, x.sku]).sort()).toEqual([
      ["A", "SHARED"],
      ["B", "SHARED"],
    ]);
    // stable: re-check reports no changes
    expect((await engine.check("manual")).summary).toEqual({ new: 0, changed: 0, removed: 0 });
  });
});
