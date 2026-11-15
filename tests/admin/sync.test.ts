import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSyncEngine } from "../../src/server/sync";
import { applyRun, discardRun, getLastRuns, getPendingRun, runManualCheck } from "../../src/server/admin";
import { setup, type Ctx } from "./helpers";

let ctx: Ctx;
beforeEach(async () => {
  ctx = await setup();
});
afterEach(() => ctx.close());

const product = (code: string) => ({
  code,
  name: `P ${code}`,
  description: null,
  brand: "B",
  brandId: 1,
  metaCategory: "M",
  family: "F",
  subfamily: "S",
  unit: "u",
  supplierPrice: 1,
  currency: "ARS",
  images: { small: [], large: ["http://x/a.jpg"] },
  variants: [],
});

function build(fetchCatalog: () => Promise<unknown>, save = async () => "A/0.jpg") {
  return createSyncEngine({
    db: ctx.db,
    source: { fetchCatalog } as never,
    imageStore: { save },
    clock: () => new Date("2026-01-01T00:00:00Z"),
  });
}

describe("admin sync wrappers (S5 data layer)", () => {
  it("manual check → pending run (serializable) → apply with image warnings", async () => {
    const engine = build(
      async () => ({ metaCategories: [], categories: [], brands: [], products: [product("N1"), product("N2")] }),
      async () => {
        throw new Error("img boom");
      },
    );
    const r = await runManualCheck({ engine });
    expect(r).toMatchObject({ ok: true, status: "pending", summary: { new: 2, changed: 0, removed: 0 } });

    const pending = (await getPendingRun({ engine }))!;
    expect(pending.id).toBe(r.runId);
    expect(pending.trigger).toBe("manual");
    expect(pending.changes.map((c) => c.code).sort()).toEqual(["N1", "N2"]);
    expect(pending).not.toHaveProperty("payload");
    expect(JSON.parse(JSON.stringify(pending))).toEqual(pending);
    expect(typeof pending.startedAt).toBe("string");

    const applied = await applyRun(pending.id, { engine });
    expect(applied.ok).toBe(true);
    expect(applied.run?.status).toBe("applied");
    expect(applied.run?.summary?.imageWarnings).toBe(2);
    expect(applied.run?.summary?.imageWarningList?.[0]).toMatchObject({ code: "N1", reason: "img boom" });
    expect(await getPendingRun({ engine })).toBeNull();
    expect((await getLastRuns(5, { engine }))[0].status).toBe("applied");
  });

  it("discard marks the run discarded; re-applying returns a non-throwing error", async () => {
    const engine = build(async () => ({ metaCategories: [], categories: [], brands: [], products: [product("N1")] }));
    const r = await runManualCheck({ engine });
    const d = await discardRun(r.runId!, { engine });
    expect(d).toMatchObject({ ok: true, error: null, run: { status: "discarded" } });
    const again = await applyRun(r.runId!, { engine });
    expect(again.ok).toBe(false);
    expect(again.run).toBeNull();
    expect(again.error).toContain("not pending");
    expect((await applyRun(9999, { engine })).error).toContain("not found");
  });

  it("failed checks surface as failed runs with the error, never throw", async () => {
    const engine = build(async () => {
      throw new Error("supplier down");
    });
    const r = await runManualCheck({ engine });
    expect(r).toMatchObject({ ok: false, status: "failed", error: "supplier down" });
    const [last] = await getLastRuns(1, { engine });
    expect(last).toMatchObject({ status: "failed", error: "supplier down", trigger: "manual" });
  });
});
