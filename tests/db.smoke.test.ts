import { describe, expect, it } from "vitest";
import { createPgliteDb } from "../src/server/db";

describe("db factory", () => {
  it("connects to an in-memory PGlite and runs select 1", async () => {
    const { db, close } = await createPgliteDb();
    try {
      const result = await db.execute("select 1 as one");
      expect(result.rows[0]).toEqual({ one: 1 });
    } finally {
      await close();
    }
  });
});
