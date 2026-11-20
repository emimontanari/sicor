import { setTimeout as delay } from "node:timers/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyRun, runManualCheck } from "../../src/server/admin";
import { bootstrapCatalog } from "../../src/server/bootstrap";
import { listProducts } from "../../src/server/catalog/read";
import { schema, type PgDb } from "../../src/server/db";
import { runScheduledCheck } from "../../src/server/jobs/sync";
import type { SupplierCatalog, SupplierProduct } from "../../src/server/masefer";
import { createSyncEngine } from "../../src/server/sync";

const url = process.env.S2_POSTGRES_FIXTURE_URL;
const product = (code: string, name = code): SupplierProduct => ({
  code, name, description: null, brand: "Fixture", brandId: 1,
  metaCategory: "M", family: "F", subfamily: "S", unit: "UN", supplierPrice: 10, currency: "ARS",
  images: { small: [], large: ["https://fixture.invalid/image.jpg"] },
  variants: [{ sku: `${code}-SKU`, color: "", size: "", text: "", stockTotal: 1, published: true }],
});
const catalog = (...products: SupplierProduct[]): SupplierCatalog => ({ metaCategories: [], categories: [], brands: [], products });
const fixture = (next: SupplierCatalog | Error) => ({
  async fetchCatalog() { if (next instanceof Error) throw next; return next; },
});
const imageStore = { save: async ({ code }: { code: string }) => `${code}/0.jpg` };

describe.skipIf(!url)("S2 append-only sync on disposable PostgreSQL", () => {
  let pool: Pool;
  let db: PgDb;
  let base: Awaited<ReturnType<typeof snapshot>>;
  const snapshot = async () => ({
    products: await db.select().from(schema.sourceProducts).orderBy(schema.sourceProducts.code),
    variants: await db.select().from(schema.sourceVariants).orderBy(schema.sourceVariants.productCode),
    overrides: await db.select().from(schema.productOverrides).orderBy(schema.productOverrides.productCode),
  });
  const engine = (next: SupplierCatalog | Error) => createSyncEngine({ db, source: fixture(next), imageStore });

  beforeAll(async () => {
    const address = new URL(url!);
    if (address.protocol !== "postgresql:" || address.hostname !== "127.0.0.1" || !address.port || address.pathname !== "/s2_fixture" || address.search || address.hash) {
      throw new Error("S2 test requires the disposable loopback s2_fixture DB");
    }
    pool = new Pool({ connectionString: url });
    db = drizzle(pool, { schema });
    const { rows: [row] } = await pool.query<{ tables: number }>("select count(*)::int as tables from pg_tables where schemaname = 'public'");
    expect(row.tables).toBe(0);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await bootstrapCatalog({ db, source: fixture(catalog(product("BASE-A"), product("BASE-B"))), imageStore });
    base = await snapshot();
  }, 15_000);
  afterAll(async () => { await pool?.end(); });

  it("imports initially, reads locally with supplier down, and fails safely on empty", async () => {
    expect(base.products.map((p) => p.code)).toEqual(["BASE-A", "BASE-B"]);
    expect(base.variants).toHaveLength(2);
    const offline = engine(new Error("fixture supplier offline"));
    expect(await runManualCheck({ engine: offline })).toMatchObject({ ok: false, status: "failed", error: "fixture supplier offline" });
    expect((await listProducts({}, db)).map((p) => p.code).sort()).toEqual(["BASE-A", "BASE-B"]);
    expect(await runScheduledCheck({ engine: engine(catalog()) })).toMatchObject({ ok: false, status: "failed", summary: null });
    expect(await snapshot()).toEqual(base);
  });

  it("unchanged has no pending additions; a mixed read only inserts the new code after confirmation", async () => {
    const same = engine(catalog(product("BASE-A"), product("BASE-B")));
    expect(await runManualCheck({ engine: same })).toMatchObject({ status: "discarded", summary: { new: 0, changed: 0, removed: 0 } });
    expect(await same.getPendingRun()).toBeNull();
    const mixed = engine(catalog(product("BASE-A", "Upstream rename"), product("MIXED")));
    const check = await runScheduledCheck({ engine: mixed });
    expect(check).toMatchObject({ status: "pending", summary: { new: 1, changed: 0, removed: 0 } });
    expect((await mixed.getPendingRun())?.changes).toEqual([{ type: "new", code: "MIXED", name: "MIXED" }]);
    expect(await snapshot()).toEqual(base);
    expect(await applyRun(check.runId!, { engine: mixed })).toMatchObject({ ok: true, run: { status: "applied", summary: { new: 1, changed: 0, removed: 0 } } });
    expect(await snapshot()).toEqual({
      products: [...base.products, expect.objectContaining({ code: "MIXED" })],
      variants: [...base.variants, expect.objectContaining({ productCode: "MIXED" })], overrides: base.overrides,
    });
  });

  it("overlapping manual/scheduled checks and confirmations keep distinct codes and insert the shared code only once", async () => {
    const before = await snapshot();
    const manual = engine(catalog(product("R-SHARED", "manual copy"), product("R-X")));
    // Shared code appears in opposite order in the two supplier payloads.
    const scheduled = engine(catalog(product("R-Y"), product("R-SHARED", "scheduled copy")));
    const [a, b] = await Promise.all([runManualCheck({ engine: manual }), runScheduledCheck({ engine: scheduled })]);
    for (const r of [a, b]) expect(r).toMatchObject({ ok: true, status: "pending", summary: { new: 2 } });
    expect((await runManualCheck({ engine: engine(catalog(product("BASE-A"))) })).status).toBe("discarded");
    expect(await snapshot()).toEqual(before);

    // Hold the first transaction after inserting R-SHARED, at its variant insert.
    // Then require the second transaction to actually wait on the shared product insert.
    const lock = await pool.connect();
    const applies: ReturnType<typeof applyRun>[] = [];
    async function awaitBlocked(table: string) {
      for (let i = 0; i < 100; i++) {
        const { rowCount } = await pool.query(
          "select 1 from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query like $1",
          [`insert into "${table}"%`],
        );
        if (rowCount) return;
        await delay(20);
      }
      throw new Error(`No blocked insert into ${table}`);
    }
    try {
      await lock.query("begin");
      await lock.query("lock table source_variants in share mode");
      applies.push(applyRun(a.runId!, { engine: manual }));
      await awaitBlocked("source_variants");
      applies.push(applyRun(b.runId!, { engine: scheduled }));
      await awaitBlocked("source_products");
    } finally {
      await lock.query("rollback");
      lock.release();
      await Promise.allSettled(applies);
    }
    const confirmed = await Promise.all(applies);
    expect(confirmed[0]).toMatchObject({ ok: true, run: { status: "applied", summary: { new: 2 } } });
    expect(confirmed[1]).toMatchObject({ ok: true, run: { status: "applied", summary: { new: 1 }, changes: [{ code: "R-Y" }] } });
    expect(await snapshot()).toEqual({
      products: [...before.products, expect.objectContaining({ code: "R-SHARED", name: "manual copy" }), expect.objectContaining({ code: "R-X" }), expect.objectContaining({ code: "R-Y" })],
      variants: [...before.variants, ...["R-SHARED", "R-X", "R-Y"].map((code) => expect.objectContaining({ productCode: code }))],
      overrides: before.overrides,
    });
  }, 10_000);
});
