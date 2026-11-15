import { createPgDb, type PgDb } from "../../../server/db";

const KEY = Symbol.for("sicor.admin.products.db");
type G = typeof globalThis & { [KEY]?: PgDb };

/** Lazy shared Postgres handle for the products admin (server only). */
export function getAdminDb(): PgDb {
  const g = globalThis as G;
  return (g[KEY] ??= createPgDb().db);
}

export function getImagesDir(): string {
  const dir = process.env.IMAGES_DIR;
  if (!dir) throw new Error("IMAGES_DIR is not set");
  return dir;
}
