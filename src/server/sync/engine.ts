import { and, eq, inArray } from "drizzle-orm";
import type { PgDb, TestDb } from "../db";
import {
  sourceProducts,
  sourceVariants,
  syncRuns,
  type SyncChange,
  type SyncPayload,
  type SyncSummary,
} from "../db/schema";
import type { MaseferSource, SupplierProduct } from "../masefer";
import {
  canonicalFromRow,
  canonicalFromSupplier,
  changedFields,
  contentHash,
  dedupeVariants,
  imageUrls,
} from "./canonical";
import type { ImageStore } from "./images";

export type SyncRun = typeof syncRuns.$inferSelect;
export type SyncTrigger = "scheduled" | "manual";

export interface SyncDeps {
  db: PgDb | TestDb;
  source: MaseferSource;
  imageStore: ImageStore;
  clock?: () => Date;
}

/** Thrown when a run is not (or no longer) pending; never recorded as a run failure. */
export class SyncRunNotPendingError extends Error {
  constructor(runId: number, status?: string) {
    super(`Sync run ${runId} is not pending${status ? ` (status: ${status})` : ""}`);
    this.name = "SyncRunNotPendingError";
  }
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createSyncEngine(deps: SyncDeps) {
  // PgDb and TestDb share the same query API; one cast keeps call sites simple.
  const db = deps.db as TestDb;
  const { source, imageStore } = deps;
  const now = deps.clock ?? (() => new Date());

  /**
   * Records a failure, but only on a run still pending/checking: a run that
   * another caller already applied/discarded is never overwritten. Returns
   * null when the run was already finalized.
   */
  async function fail(runId: number, e: unknown): Promise<SyncRun | null> {
    const [r] = await db
      .update(syncRuns)
      .set({ status: "failed", error: msg(e), finishedAt: now() })
      .where(and(eq(syncRuns.id, runId), inArray(syncRuns.status, ["pending", "checking"])))
      .returning();
    return r ?? null;
  }

  async function failOrReject(runId: number, e: unknown): Promise<SyncRun> {
    const r = await fail(runId, e);
    if (!r) throw new SyncRunNotPendingError(runId);
    return r;
  }

  async function supersedePending(exceptId: number) {
    const pending = await db.select().from(syncRuns).where(eq(syncRuns.status, "pending"));
    const ids = pending.map((r) => r.id).filter((id) => id !== exceptId);
    if (ids.length > 0) {
      await db
        .update(syncRuns)
        .set({ status: "discarded", finishedAt: now() })
        .where(inArray(syncRuns.id, ids));
    }
  }

  /** Computes and stores pending changes. Never writes source_* or product_overrides (S4). */
  async function check(trigger: SyncTrigger): Promise<SyncRun> {
    const [run] = await db
      .insert(syncRuns)
      .values({ trigger, status: "checking", startedAt: now() })
      .returning();
    try {
      const catalog = await source.fetchCatalog();
      const rows = await db.select().from(sourceProducts);
      const varRows = await db.select().from(sourceVariants);
      const byCode = new Map(rows.map((r) => [r.code, r]));
      const varsByCode = new Map<string, typeof varRows>();
      for (const v of varRows) {
        const list = varsByCode.get(v.productCode) ?? [];
        list.push(v);
        varsByCode.set(v.productCode, list);
      }

      const news: SyncChange[] = [];
      const changed: SyncChange[] = [];
      const removed: SyncChange[] = [];
      const payloadProducts: SupplierProduct[] = [];
      const unchanged: string[] = [];
      const seen = new Set<string>();

      for (const p of catalog.products) {
        seen.add(p.code);
        const row = byCode.get(p.code);
        if (!row) {
          news.push({ type: "new", code: p.code, name: p.name });
          payloadProducts.push(p);
          continue;
        }
        const next = canonicalFromSupplier(p);
        const hash = contentHash(next);
        const reactivated = row.status === "discontinued";
        if (hash === row.contentHash && !reactivated) {
          unchanged.push(p.code);
          continue;
        }
        const prev = canonicalFromRow(row, varsByCode.get(p.code) ?? []);
        const fields: string[] = changedFields(prev, next);
        if (reactivated) fields.push("status");
        changed.push({ type: "changed", code: p.code, name: p.name, fields });
        payloadProducts.push(p);
      }
      const removedCodes: string[] = [];
      for (const r of rows) {
        if (!seen.has(r.code) && r.status === "active") {
          removed.push({ type: "removed", code: r.code, name: r.name });
          removedCodes.push(r.code);
        }
      }

      const changes = [...news, ...changed, ...removed];
      const summary: SyncSummary = { new: news.length, changed: changed.length, removed: removed.length };
      await supersedePending(run.id);
      // Zero changes: nothing for the admin to confirm, so the run is finished as
      // "discarded" with a zero summary instead of leaving a noisy pending run.
      if (changes.length === 0) {
        const [r] = await db
          .update(syncRuns)
          .set({ status: "discarded", summary, changes: [], finishedAt: now() })
          .where(eq(syncRuns.id, run.id))
          .returning();
        return r;
      }
      const payload: SyncPayload = { products: payloadProducts, removed: removedCodes, unchanged };
      const [r] = await db
        .update(syncRuns)
        .set({ status: "pending", summary, changes, payload, finishedAt: now() })
        .where(eq(syncRuns.id, run.id))
        .returning();
      return r;
    } catch (e) {
      return failOrReject(run.id, e);
    }
  }

  async function loadPending(runId: number): Promise<SyncRun> {
    const [run] = await db.select().from(syncRuns).where(eq(syncRuns.id, runId));
    if (!run) throw new Error(`Sync run ${runId} not found`);
    if (run.status !== "pending") {
      throw new SyncRunNotPendingError(runId, run.status);
    }
    return run;
  }

  /** Applies a pending run from its stored payload, atomically (S5, S6, S7). Never touches product_overrides (S2). */
  async function apply(runId: number): Promise<SyncRun> {
    const run = await loadPending(runId);
    const payload = run.payload;
    if (!payload) return failOrReject(runId, new Error("Pending run has no payload"));
    const products = payload.products as SupplierProduct[];
    try {
      // S6: copy images BEFORE touching the DB, so an image failure leaves it untouched.
      const local = new Map<string, string[]>();
      for (const p of products) {
        const paths: string[] = [];
        let i = 0;
        for (const url of imageUrls(p)) {
          paths.push(await imageStore.save({ code: p.code, index: i++, url }));
        }
        local.set(p.code, paths);
      }

      const at = now();
      const done = await db.transaction(async (tx) => {
        // Claim the run FIRST: only one concurrent apply can flip pending -> applied.
        // The loser claims 0 rows and throws, rolling back before touching any data.
        const [claimed] = await tx
          .update(syncRuns)
          .set({ status: "applied", appliedAt: at, finishedAt: at })
          .where(and(eq(syncRuns.id, runId), eq(syncRuns.status, "pending")))
          .returning();
        if (!claimed) throw new SyncRunNotPendingError(runId);
        const codes = products.map((p) => p.code);
        const existing = codes.length
          ? await tx.select({ code: sourceProducts.code }).from(sourceProducts).where(inArray(sourceProducts.code, codes))
          : [];
        const exists = new Set(existing.map((e) => e.code));

        if (existing.length > 0) {
          await tx.delete(sourceVariants).where(inArray(sourceVariants.productCode, [...exists]));
        }
        for (const p of products) {
          const c = canonicalFromSupplier(p);
          const fields = {
            name: p.name,
            brand: p.brand,
            metaCategory: p.metaCategory,
            family: p.family,
            subfamily: p.subfamily,
            unit: p.unit,
            supplierPrice: p.supplierPrice === null ? null : p.supplierPrice.toFixed(2),
            currency: p.currency,
            supplierImages: imageUrls(p),
            localImages: local.get(p.code) ?? [],
            status: "active" as const,
            lastSeenAt: at,
            contentHash: contentHash(c),
          };
          if (exists.has(p.code)) {
            await tx.update(sourceProducts).set(fields).where(eq(sourceProducts.code, p.code));
          } else {
            await tx.insert(sourceProducts).values({ code: p.code, ...fields, firstSeenAt: at });
          }
          const variantsToInsert = dedupeVariants(p.variants);
          if (variantsToInsert.length > 0) {
            await tx.insert(sourceVariants).values(
              variantsToInsert.map((v) => ({
                productCode: p.code,
                sku: v.sku,
                color: v.color,
                size: v.size,
                text: v.text,
                stockTotal: v.stockTotal,
                published: v.published,
              })),
            );
          }
        }
        if (payload.removed.length > 0) {
          await tx
            .update(sourceProducts)
            .set({ status: "discontinued" })
            .where(inArray(sourceProducts.code, payload.removed));
        }
        if (payload.unchanged.length > 0) {
          await tx
            .update(sourceProducts)
            .set({ lastSeenAt: at })
            .where(inArray(sourceProducts.code, payload.unchanged));
        }
        return claimed;
      });
      return done;
    } catch (e) {
      if (e instanceof SyncRunNotPendingError) throw e;
      return failOrReject(runId, e);
    }
  }

  async function discard(runId: number): Promise<SyncRun> {
    await loadPending(runId);
    const [r] = await db
      .update(syncRuns)
      .set({ status: "discarded", finishedAt: now() })
      .where(eq(syncRuns.id, runId))
      .returning();
    return r;
  }

  async function getPendingRun(): Promise<SyncRun | null> {
    const rows = await db.select().from(syncRuns).where(eq(syncRuns.status, "pending"));
    return rows.sort((a, b) => b.id - a.id)[0] ?? null;
  }

  async function getLastRuns(limit = 10): Promise<SyncRun[]> {
    const rows = await db.select().from(syncRuns);
    return rows.sort((a, b) => b.id - a.id).slice(0, limit);
  }

  return { check, apply, discard, getPendingRun, getLastRuns };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
