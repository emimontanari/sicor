import type { PgDb, TestDb } from "../db";

export type Db = PgDb | TestDb;

/** Invalid admin input. `fields` maps field name -> message. */
export class AdminValidationError extends Error {
  constructor(public readonly fields: Record<string, string>) {
    super(`Validation failed: ${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("; ")}`);
    this.name = "AdminValidationError";
  }
}

/** Unknown product code / category. */
export class AdminNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminNotFoundError";
  }
}
