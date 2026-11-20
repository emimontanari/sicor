import { eq, inArray } from "drizzle-orm";
import type { PgDb, TestDb } from "../db";
import { categories, categoryMappings, productOverrides, sourceProducts } from "../db/schema";
import { seedCategories } from "../db/seed";
import type { MaseferSource } from "../masefer";
import { createSyncEngine, type ImageStore } from "../sync";
import { DEFAULT_CATEGORY_MAPPINGS } from "./category-mappings";
import { PDF_PRODUCTS } from "./pdf-products";

export { DEFAULT_CATEGORY_MAPPINGS } from "./category-mappings";
export { PDF_PRODUCTS } from "./pdf-products";

export interface BootstrapDeps {
  db: PgDb | TestDb;
  source: MaseferSource;
  imageStore: ImageStore;
  clock?: () => Date;
}

export interface BootstrapResult {
  /** Sync run id applied by this bootstrap (null when there was nothing pending). */
  appliedRunId: number | null;
  /** Active products visible after the bootstrap. */
  published: number;
  /** Active products the admin explicitly hid (left hidden). */
  alreadyHidden: number;
  /** PDF codes that do not exist in the supplier data (skipped). */
  unmatched: string[];
}

/**
 * One-time curation bootstrap (S8). Idempotent and non-destructive: existing
 * mappings and every override field the admin already set are left untouched;
 * only missing rows / null fields are filled.
 */
export async function bootstrapCatalog(deps: BootstrapDeps): Promise<BootstrapResult> {
  const db = deps.db as TestDb;
  const now = deps.clock ?? (() => new Date());

  await seedCategories(db);
  const cats = await db.select().from(categories);
  const idBySlug = new Map(cats.map((c) => [c.slug, c.id]));

  await db
    .insert(categoryMappings)
    .values(
      DEFAULT_CATEGORY_MAPPINGS.map((m) => ({
        metaCategory: m.metaCategory,
        family: m.family,
        subfamily: m.subfamily,
        categoryId: idBySlug.get(m.categorySlug)!,
      })),
    )
    // An admin may have remapped a source key: keep their choice.
    .onConflictDoNothing();

  let appliedRunId: number | null = null;
  // Bootstrap is the explicit first-import command, not a way to auto-confirm later syncs.
  const [initialized] = await db.select({ code: sourceProducts.code }).from(sourceProducts).limit(1);
  if (!initialized) {
    const engine = createSyncEngine({ db, source: deps.source, imageStore: deps.imageStore, clock: now });
    const run = await engine.check("manual");
    if (run.status === "failed") throw new Error(`Bootstrap sync check failed: ${run.error ?? "unknown error"}`);
    if (run.status === "pending") {
      const applied = await engine.apply(run.id);
      if (applied.status === "failed") throw new Error(`Bootstrap sync apply failed: ${applied.error ?? "unknown error"}`);
      appliedRunId = run.id;
    }
  }

  const pdfRows = await db
    .select({ code: sourceProducts.code, status: sourceProducts.status })
    .from(sourceProducts)
    .where(inArray(sourceProducts.code, PDF_PRODUCTS.map((p) => p.code)));
  const known = new Set(pdfRows.map((r) => r.code));
  const present = new Set(pdfRows.filter((r) => r.status === "active").map((r) => r.code));
  const unmatched = [...new Set(PDF_PRODUCTS.filter((p) => !known.has(p.code)).map((p) => p.code))];

  for (const p of PDF_PRODUCTS) {
    if (!present.has(p.code)) continue;
    const categoryId = idBySlug.get(p.categorySlug) ?? null;
    const [existing] = await db.select().from(productOverrides).where(eq(productOverrides.productCode, p.code));
    if (!existing) {
      // publish-on-sync S1: only the curated category and note need an override row;
      // publication itself is the default (no visible/reviewed writes).
      await db
        .insert(productOverrides)
        .values({ productCode: p.code, categoryId, customDescription: p.note, updatedAt: now() })
        .onConflictDoNothing();
    } else {
      const patch: Partial<typeof productOverrides.$inferInsert> = {};
      if (existing.categoryId === null && categoryId !== null) patch.categoryId = categoryId;
      if (existing.customDescription === null && p.note !== null) patch.customDescription = p.note;
      if (Object.keys(patch).length > 0) {
        await db.update(productOverrides).set({ ...patch, updatedAt: now() }).where(eq(productOverrides.productCode, p.code));
      }
    }
  }

  // Every other active product is visible by default (S1): no override rows are created and
  // no null visible is forced, so a rerun never hides (or un-hides) what the admin decided.
  const activeRows = await db
    .select({ code: sourceProducts.code })
    .from(sourceProducts)
    .where(eq(sourceProducts.status, "active"));
  const ovRows = await db
    .select({ code: productOverrides.productCode, visible: productOverrides.visible, archivedAt: productOverrides.archivedAt })
    .from(productOverrides);
  const ovByCode = new Map(ovRows.map((o) => [o.code, o]));
  let published = 0;
  let alreadyHidden = 0;
  for (const a of activeRows) {
    const o = ovByCode.get(a.code);
    if (o?.archivedAt) continue;
    if (o?.visible === false) {
      alreadyHidden++;
      continue;
    }
    published++;
  }
  return { appliedRunId, published, alreadyHidden, unmatched };
}
