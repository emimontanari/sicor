import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { Pool } from "pg";
import * as schema from "./schema";

export { schema };

export type PgDb = NodePgDatabase<typeof schema>;
export type TestDb = PgliteDatabase<typeof schema>;

/** Production database: Postgres through `DATABASE_URL`. */
export function createPgDb(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const pool = new Pool({ connectionString });
  const db: PgDb = drizzlePg(pool, { schema });
  return { db, close: () => pool.end() };
}

/** In-memory PGlite database for tests (no Docker, no server). */
export async function createPgliteDb(dataDir?: string) {
  const { PGlite } = await import("@electric-sql/pglite");
  const client = new PGlite(dataDir);
  await client.waitReady;
  const db: TestDb = drizzlePglite(client, { schema });
  return { db, close: () => client.close() };
}
