import { createPgDb } from "../../../server/db";

/** Opens a short-lived pool for one admin page/action and always closes it. */
export async function withDb<T>(fn: (db: ReturnType<typeof createPgDb>["db"]) => Promise<T>): Promise<T> {
  const { db, close } = createPgDb();
  try {
    return await fn(db);
  } finally {
    await close().catch(() => undefined);
  }
}
