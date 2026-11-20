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
import { MaseferSyncError, type MaseferSource, type SupplierProduct } from "../masefer";
import {
  canonDocuments,
  canonicalFromSupplier,
  contentHash,
  dedupeVariants,
  imageUrls,
} from "./canonical";
import { FsDocumentStore, type DocumentStore } from "./documents";
import { FsImageStore, type ImageStore } from "./images";

export type SyncRun = typeof syncRuns.$inferSelect;
export type SyncTrigger = "scheduled" | "manual";

export interface SyncDeps {
  db: PgDb | TestDb;
  source: MaseferSource;
  imageStore: ImageStore;
  /**
   * PDF copy store. Defaults to an {@link FsDocumentStore} on the same root/fetch as an
   * {@link FsImageStore}; with any other image store and no explicit store, documents are not copied
   * (each one becomes a warning).
   */
  documentStore?: DocumentStore;
  clock?: () => Date;
  /** Max simultaneous image downloads during apply (default 6). */
  imageConcurrency?: number;
  /** Max simultaneous PDF downloads (default 2: Dropbox throttles bursts). */
  documentConcurrency?: number;
}

/** Extra fields stored in sync_runs.summary by apply (jsonb; no schema change). */
export type ImageWarning = { code: string; url: string; reason: string };
export type DocumentWarning = ImageWarning;
const MAX_WARNING_LIST = 50;

export type RepairResult = { repaired: number; stillMissing: number; warnings: ImageWarning[] };

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
  const documentStore: DocumentStore | undefined =
    deps.documentStore ?? (imageStore instanceof FsImageStore ? new FsDocumentStore(imageStore.dir, imageStore.fetchFn) : undefined);
  const now = deps.clock ?? (() => new Date());
  const concurrency = Math.max(1, deps.imageConcurrency ?? 6);
  const docConcurrency = Math.max(1, deps.documentConcurrency ?? 2);

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

  // R3-002 is resolved structurally in the append-only design: checks no longer
  // supersede pending runs, so a late older check cannot drop a newer pending run.

  /** Select only candidates absent now; apply separately enforces uniqueness at insert time. */
  async function absentProducts(candidates: SupplierProduct[]): Promise<SupplierProduct[]> {
    if (!candidates.length) return [];
    const rows = await db.select({ code: sourceProducts.code }).from(sourceProducts);
    const seen = new Set(rows.map((r) => r.code));
    return candidates.filter((p) => {
      if (seen.has(p.code)) return false;
      seen.add(p.code);
      return true;
    });
  }

  /** Records just new codes for explicit confirmation. Never writes catalog tables. */
  async function check(trigger: SyncTrigger): Promise<SyncRun> {
    const [run] = await db
      .insert(syncRuns)
      .values({ trigger, status: "checking", startedAt: now() })
      .returning();
    try {
      const catalog = await source.fetchCatalog();
      if (catalog.products.length === 0) {
        throw new MaseferSyncError("empty", "Masefer no devolvió productos válidos. No se modificó el catálogo.");
      }
      const products = await absentProducts(catalog.products);
      const changes: SyncChange[] = products.map((p) => ({ type: "new", code: p.code, name: p.name }));
      const summary: SyncSummary = { new: changes.length, changed: 0, removed: 0 };
      // Keep independent pending runs: later reads need not contain all earlier additions.
      const payload: SyncPayload | null = changes.length ? { products, removed: [], unchanged: [] } : null;
      const [r] = await db
        .update(syncRuns)
        .set({ status: payload ? "pending" : "discarded", summary, changes, payload, finishedAt: now() })
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

  /** Confirms a pending run atomically, inserting only still-absent additions. */
  async function apply(runId: number): Promise<SyncRun> {
    const run = await loadPending(runId);
    const payload = run.payload;
    if (!payload) return failOrReject(runId, new Error("Pending run has no payload"));
    try {
      // Legacy payloads include changed products too. Only honor proposed additions.
      const addedCodes = new Set(run.changes?.filter((change) => change.type === "new").map((change) => change.code));
      const products = await absentProducts((payload.products as SupplierProduct[]).filter((p) => addedCodes.has(p.code)));
      // Consistent lock order when different runs share multiple product codes.
      products.sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
      // S6: copy images BEFORE touching the DB. A bad image is skipped with a
      // warning (never fatal); only DB/transaction errors fail the run.
      const tasks = products.flatMap((p) =>
        imageUrls(p).map((url, index) => ({ code: p.code, index, url })),
      );
      const saved = new Map<string, Map<number, string>>();
      const warnings: ImageWarning[] = [];
      let next = 0;
      const worker = async () => {
        while (next < tasks.length) {
          const t = tasks[next++];
          try {
            const rel = await imageStore.save(t);
            const m = saved.get(t.code) ?? new Map<number, string>();
            m.set(t.index, rel);
            saved.set(t.code, m);
          } catch (e) {
            warnings.push({ code: t.code, url: t.url, reason: msg(e) });
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
      warnings.sort((x, y) => (x.code === y.code ? 0 : x.code < y.code ? -1 : 1));
      const local = new Map<string, string[]>(
        products.map((p) => [
          p.code,
          [...(saved.get(p.code) ?? new Map<number, string>()).entries()].sort((x, y) => x[0] - y[0]).map(([, v]) => v),
        ]),
      );

      // S4: copy supplier PDFs too; same rules (per-document failure = warning, never fatal).
      const docTasks = products.flatMap((p) =>
        (p.documents ?? []).map((d, index) => ({ code: p.code, index, url: d.url })),
      );
      const savedDocs = new Map<string, Map<number, string>>();
      const docWarnings: DocumentWarning[] = [];
      let nextDoc = 0;
      const docWorker = async () => {
        while (nextDoc < docTasks.length) {
          const t = docTasks[nextDoc++];
          try {
            if (!documentStore) throw new Error("No document store configured");
            const rel = await documentStore.save(t);
            const m = savedDocs.get(t.code) ?? new Map<number, string>();
            m.set(t.index, rel);
            savedDocs.set(t.code, m);
          } catch (e) {
            docWarnings.push({ code: t.code, url: t.url, reason: msg(e) });
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(docConcurrency, docTasks.length) }, docWorker));
      docWarnings.sort((x, y) => (x.code === y.code ? 0 : x.code < y.code ? -1 : 1));
      const localDocs = (p: SupplierProduct) =>
        (p.documents ?? []).flatMap((d, index) => {
          const path = savedDocs.get(p.code)?.get(index);
          return path ? [{ kind: d.kind, label: d.label, path }] : [];
        });

      const at = now();
      return await db.transaction(async (tx) => {
        // Claim the run first; confirm and discard compete on the same pending row.
        const [claimed] = await tx
          .update(syncRuns)
          .set({ status: "applied", appliedAt: at, finishedAt: at })
          .where(and(eq(syncRuns.id, runId), eq(syncRuns.status, "pending")))
          .returning({ id: syncRuns.id });
        if (!claimed) throw new SyncRunNotPendingError(runId);
        const changes: SyncChange[] = [];
        const inserted = new Set<string>();
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
            supplierDocuments: canonDocuments(p.documents),
            localDocuments: localDocs(p),
            status: "active" as const,
            lastSeenAt: at,
            contentHash: contentHash(c),
          };
          const [row] = await tx.insert(sourceProducts)
            .values({ code: p.code, ...fields, firstSeenAt: at })
            .onConflictDoNothing({ target: sourceProducts.code })
            .returning({ code: sourceProducts.code });
          if (!row) continue;
          inserted.add(row.code);
          changes.push({ type: "new", code: row.code, name: p.name });
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
        const imageWarnings = warnings.filter((w) => inserted.has(w.code));
        const documentWarnings = docWarnings.filter((w) => inserted.has(w.code));
        const summary = {
          new: changes.length, changed: 0, removed: 0,
          imageWarnings: imageWarnings.length,
          imageWarningList: imageWarnings.slice(0, MAX_WARNING_LIST),
          documentWarnings: documentWarnings.length,
          documentWarningList: documentWarnings.slice(0, MAX_WARNING_LIST),
        };
        const [done] = await tx.update(syncRuns).set({ summary, changes }).where(eq(syncRuns.id, runId)).returning();
        return done;
      });
    } catch (e) {
      if (e instanceof SyncRunNotPendingError) throw e;
      return failOrReject(runId, e);
    }
  }

  /**
   * Explicit repair for copied assets, not invoked by check or apply. Finds active products whose
   * supplier images/documents are not (or no longer, if the store can tell via `has`) present locally,
   * re-downloads just those (stores skip files that
   * exist), and rewrites only local_images / local_documents. Per-asset failures are warnings, never
   * thrown. Never touches product_overrides or any supplier field.
   */
  async function repairAssets(opts: { skip?: ReadonlySet<string> } = {}): Promise<RepairResult> {
    const rows = await db.select().from(sourceProducts).where(eq(sourceProducts.status, "active"));
    const present = async (store: { has?(p: string): Promise<boolean> } | undefined, paths: string[]) => {
      if (!store?.has) return true;
      for (const p of paths) if (!(await store.has(p))) return false;
      return true;
    };
    type Job = { code: string; kind: "image" | "doc"; run: () => Promise<{ fixed: number; missing: number }> };
    const jobs: Job[] = [];
    const warnings: ImageWarning[] = [];
    for (const r of rows) {
      if (opts.skip?.has(r.code)) continue;
      const images = r.supplierImages ?? [];
      const docs = r.supplierDocuments ?? [];
      const localImgs = r.localImages ?? [];
      const localDocs = r.localDocuments ?? [];
      if (images.length > 0 && (localImgs.length < images.length || !(await present(imageStore, localImgs)))) {
        jobs.push({
          code: r.code,
          kind: "image",
          run: async () => {
            const before = localImgs.length < images.length ? localImgs.length : 0;
            const out: string[] = [];
            for (const [index, url] of images.entries()) {
              try {
                out.push(await imageStore.save({ code: r.code, index, url }));
              } catch (e) {
                warnings.push({ code: r.code, url, reason: msg(e) });
              }
            }
            await db.update(sourceProducts).set({ localImages: out }).where(eq(sourceProducts.code, r.code));
            return { fixed: Math.max(0, out.length - before), missing: images.length - out.length };
          },
        });
      }
      if (docs.length > 0 && (localDocs.length < docs.length || !(await present(documentStore, localDocs.map((d) => d.path))))) {
        jobs.push({
          code: r.code,
          kind: "doc",
          run: async () => {
            const before = localDocs.length < docs.length ? localDocs.length : 0;
            const out: { kind: "ficha" | "certificacion"; label: string; path: string }[] = [];
            for (const [index, d] of docs.entries()) {
              try {
                if (!documentStore) throw new Error("No document store configured");
                out.push({ kind: d.kind, label: d.label, path: await documentStore.save({ code: r.code, index, url: d.url }) });
              } catch (e) {
                warnings.push({ code: r.code, url: d.url, reason: msg(e) });
              }
            }
            await db.update(sourceProducts).set({ localDocuments: out }).where(eq(sourceProducts.code, r.code));
            return { fixed: Math.max(0, out.length - before), missing: docs.length - out.length };
          },
        });
      }
    }
    let repaired = 0;
    let stillMissing = 0;
    const pool = async (list: Job[], size: number) => {
      let n = 0;
      const worker = async () => {
        while (n < list.length) {
          const j = list[n++];
          try {
            const res = await j.run();
            repaired += res.fixed;
            stillMissing += res.missing;
          } catch (e) {
            warnings.push({ code: j.code, url: "", reason: msg(e) });
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(size, list.length) }, worker));
    };
    await pool(jobs.filter((j) => j.kind === "image"), concurrency);
    await pool(jobs.filter((j) => j.kind === "doc"), docConcurrency);
    warnings.sort((x, y) => (x.code === y.code ? (x.url < y.url ? -1 : 1) : x.code < y.code ? -1 : 1));
    return { repaired, stillMissing, warnings: warnings.slice(0, MAX_WARNING_LIST) };
  }

  async function discard(runId: number): Promise<SyncRun> {
    await loadPending(runId);
    // Conditional on still being pending: an apply that commits between the
    // read above and this update must never be overwritten (R3-003).
    const [r] = await db
      .update(syncRuns)
      .set({ status: "discarded", finishedAt: now() })
      .where(and(eq(syncRuns.id, runId), eq(syncRuns.status, "pending")))
      .returning();
    if (!r) throw new SyncRunNotPendingError(runId);
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

  return { check, apply, discard, getPendingRun, getLastRuns, repairAssets };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
