import { describe, expect, it } from "vitest";
import { createPgliteDb } from "../../src/server/db";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createSyncEngine } from "../../src/server/sync";
import { runCheck, runScheduledCheck, toCheckResult } from "../../src/server/jobs/sync";
import type { SyncRun } from "../../src/server/sync";

const base = { id: 7, trigger: "scheduled", startedAt: new Date(), finishedAt: null } as SyncRun;

describe("toCheckResult (S7)", () => {
  it("maps a pending run to ok with summary", () => {
    const r = toCheckResult({ ...base, status: "pending", summary: { new: 1, changed: 2, removed: 3 }, error: null } as SyncRun);
    expect(r).toEqual({ ok: true, runId: 7, status: "pending", summary: { new: 1, changed: 2, removed: 3 }, error: null });
  });
  it("maps a failed run to ok:false with error", () => {
    const r = toCheckResult({ ...base, status: "failed", summary: null, error: "boom" } as SyncRun);
    expect(r).toEqual({ ok: false, runId: 7, status: "failed", summary: null, error: "boom" });
  });
});

describe("runScheduledCheck", () => {
  async function engineWith(fetchCatalog: () => Promise<never>) {
    const { db } = await createPgliteDb();
    await migrate(db, { migrationsFolder: "./drizzle" });
    const engine = createSyncEngine({
      db,
      source: { fetchCatalog } as never,
      imageStore: { save: async () => "x" },
    });
    return { db, engine };
  }

  it("returns a non-throwing failed result and records a failed run when the source fails", async () => {
    const { engine } = await engineWith(async () => {
      throw new Error("supplier down");
    });
    const r = await runScheduledCheck({ engine });
    expect(r.ok).toBe(false);
    expect(r.status).toBe("failed");
    expect(r.error).toContain("supplier down");
    expect(r.runId).toBeTypeOf("number");
    const runs = await engine.getLastRuns(5);
    expect(runs[0]).toMatchObject({ trigger: "scheduled", status: "failed" });
  });

  it("returns ok (no changes) with the scheduled trigger on success", async () => {
    const empty = { metaCategories: [], categories: [], brands: [], products: [] };
    const { engine } = await engineWith((async () => empty) as never);
    const r = await runScheduledCheck({ engine });
    expect(r).toMatchObject({ ok: true, error: null, summary: { new: 0, changed: 0, removed: 0 } });
    expect(r.status).not.toBe("failed");
    expect((await engine.getLastRuns(1))[0].trigger).toBe("scheduled");
  });

  it("never throws when the engine itself throws", async () => {
    const engine = { check: async () => { throw new Error("db gone"); } } as never;
    expect(await runCheck("manual", { engine })).toEqual({ ok: false, runId: null, status: "failed", summary: null, error: "db gone" });
  });
});

describe("runCheck repairs assets", () => {
  it("calls repairAssets after a successful check and never fails because of it", async () => {
    const run = { id: 1, status: "discarded", summary: { new: 0, changed: 0, removed: 0 }, error: null } as unknown as SyncRun;
    let repairs = 0;
    const ok = await runCheck("scheduled", {
      engine: { check: async () => run, repairAssets: async () => (repairs++, { repaired: 2, stillMissing: 1, warnings: [] }) },
    });
    expect(repairs).toBe(1);
    expect(ok).toMatchObject({ ok: true, repair: { repaired: 2, stillMissing: 1 } });
    const boom = await runCheck("scheduled", {
      engine: { check: async () => run, repairAssets: async () => { throw new Error("x"); } },
    });
    expect(boom.ok).toBe(true);
  });
});
