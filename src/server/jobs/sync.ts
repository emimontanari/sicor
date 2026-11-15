import { createPgDb } from "../db";
import { MaseferClient } from "../masefer";
import { createSyncEngine, FsImageStore, type RepairResult, type SyncEngine, type SyncRun, type SyncTrigger } from "../sync";
import type { SyncSummary } from "../db/schema";

export type JobEnv = Record<string, string | undefined>;

/** Production wiring: Postgres + Masefer DDP client + filesystem images + real clock. */
export function buildSyncEngine(env: JobEnv = process.env) {
  const { db, close } = createPgDb(env.DATABASE_URL);
  const engine = createSyncEngine({
    db,
    source: new MaseferClient(),
    imageStore: new FsImageStore(env.IMAGES_DIR ?? "./data/images"),
    clock: () => new Date(),
  });
  return { engine, close };
}

export interface CheckResult {
  ok: boolean;
  runId: number | null;
  status: SyncRun["status"];
  summary: SyncSummary | null;
  error: string | null;
  /** Result of the asset self-healing pass that follows a check (absent when it did not run). */
  repair?: RepairResult;
}

export function toCheckResult(run: SyncRun): CheckResult {
  return {
    ok: run.status !== "failed",
    runId: run.id,
    status: run.status,
    summary: run.summary ?? null,
    error: run.error ?? null,
  };
}

export interface RunCheckOptions {
  env?: JobEnv;
  /** Inject an engine (tests); otherwise one is built from env and closed afterwards. */
  engine?: Pick<SyncEngine, "check"> & Partial<Pick<SyncEngine, "repairAssets">>;
}

/** Runs a check; engine failures are recorded as failed runs (S7). Never throws. */
export async function runCheck(trigger: SyncTrigger, opts: RunCheckOptions = {}): Promise<CheckResult> {
  let close: (() => Promise<void>) | undefined;
  try {
    let engine = opts.engine;
    if (!engine) {
      const built = buildSyncEngine(opts.env);
      engine = built.engine;
      close = built.close;
    }
    const result = toCheckResult(await engine.check(trigger));
    // Self-healing: copy images/PDFs that earlier runs failed to download. Never fails the check.
    if (result.ok && engine.repairAssets) {
      const repair = await engine.repairAssets().catch(() => undefined);
      if (repair) result.repair = repair;
    }
    return result;
  } catch (e) {
    return { ok: false, runId: null, status: "failed", summary: null, error: e instanceof Error ? e.message : String(e) };
  } finally {
    await close?.().catch(() => undefined);
  }
}

export const runScheduledCheck = (opts?: RunCheckOptions) => runCheck("scheduled", opts);
