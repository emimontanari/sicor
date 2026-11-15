import { buildSyncEngine, runCheck, type CheckResult } from "../jobs/sync";
import { SyncRunNotPendingError, type SyncEngine, type SyncRun } from "../sync";
import type { SyncChange, SyncSummary } from "../db/schema";

export type AdminSyncSummary = SyncSummary & {
  imageWarnings?: number;
  imageWarningList?: { code: string; url: string; reason: string }[];
};

/** Serializable view of a sync run (no payload, ISO dates). */
export type AdminRun = {
  id: number;
  trigger: "scheduled" | "manual";
  status: SyncRun["status"];
  startedAt: string;
  finishedAt: string | null;
  appliedAt: string | null;
  summary: AdminSyncSummary | null;
  changes: SyncChange[];
  error: string | null;
};

export function toAdminRun(r: SyncRun): AdminRun {
  return {
    id: r.id,
    trigger: r.trigger,
    status: r.status,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    appliedAt: r.appliedAt?.toISOString() ?? null,
    summary: (r.summary as AdminSyncSummary | null) ?? null,
    changes: r.changes ?? [],
    error: r.error ?? null,
  };
}

export type RunActionResult = { ok: boolean; run: AdminRun | null; error: string | null };

export type AdminSyncOptions = {
  /** Inject an engine (tests); otherwise one is built per call and closed afterwards. */
  engine?: SyncEngine;
};

async function withEngine<T>(opts: AdminSyncOptions, fn: (e: SyncEngine) => Promise<T>): Promise<T> {
  if (opts.engine) return fn(opts.engine);
  const { engine, close } = buildSyncEngine();
  try {
    return await fn(engine);
  } finally {
    await close().catch(() => undefined);
  }
}

export async function getPendingRun(opts: AdminSyncOptions = {}): Promise<AdminRun | null> {
  const r = await withEngine(opts, (e) => e.getPendingRun());
  return r ? toAdminRun(r) : null;
}

export async function getLastRuns(limit = 10, opts: AdminSyncOptions = {}): Promise<AdminRun[]> {
  return (await withEngine(opts, (e) => e.getLastRuns(limit))).map(toAdminRun);
}

/** "Buscar actualizaciones": runs check("manual"); never throws. */
export function runManualCheck(opts: AdminSyncOptions = {}): Promise<CheckResult> {
  return runCheck("manual", { engine: opts.engine });
}

async function act(opts: AdminSyncOptions, fn: (e: SyncEngine) => Promise<SyncRun>): Promise<RunActionResult> {
  try {
    const run = toAdminRun(await withEngine(opts, fn));
    return { ok: run.status !== "failed", run, error: run.error };
  } catch (e) {
    const known = e instanceof SyncRunNotPendingError;
    return { ok: false, run: null, error: known || e instanceof Error ? (e as Error).message : String(e) };
  }
}

export const applyRun = (runId: number, opts: AdminSyncOptions = {}) => act(opts, (e) => e.apply(runId));
export const discardRun = (runId: number, opts: AdminSyncOptions = {}) => act(opts, (e) => e.discard(runId));
