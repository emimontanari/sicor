import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const tz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const productStatus = pgEnum("product_status", ["active", "discontinued"]);
export const syncTrigger = pgEnum("sync_trigger", ["scheduled", "manual"]);
export const syncStatus = pgEnum("sync_status", [
  "checking",
  "pending",
  "applied",
  "discarded",
  "failed",
]);

/** SICOR's catalog categories (seeded by `seedCategories`). */
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** Supplier data. Overwritten only by sync apply (S2). */
export const sourceProducts = pgTable("source_products", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  brand: text("brand"),
  metaCategory: text("meta_category"),
  family: text("family"),
  subfamily: text("subfamily"),
  unit: text("unit"),
  /** Stored but never public by default (S9). */
  supplierPrice: numeric("supplier_price", { precision: 14, scale: 2 }),
  currency: text("currency"),
  supplierImages: jsonb("supplier_images").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  /** Paths of images copied into app storage (S6). */
  localImages: jsonb("local_images").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  status: productStatus("status").notNull().default("active"),
  firstSeenAt: tz("first_seen_at").notNull().defaultNow(),
  lastSeenAt: tz("last_seen_at").notNull().defaultNow(),
  contentHash: text("content_hash"),
});

export const sourceVariants = pgTable(
  "source_variants",
  {
    id: serial("id").primaryKey(),
    productCode: text("product_code")
      .notNull()
      .references(() => sourceProducts.code, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    color: text("color"),
    size: text("size"),
    text: text("text"),
    stockTotal: integer("stock_total"),
    published: boolean("published").notNull().default(true),
  },
  (t) => [
    index("source_variants_product_code_idx").on(t.productCode),
    // A SKU may appear under several products; unique only within one product.
    uniqueIndex("source_variants_product_sku_uq").on(t.productCode, t.sku),
  ],
);

/** Client edits. NEVER written by sync (S2). */
export const productOverrides = pgTable("product_overrides", {
  productCode: text("product_code")
    .primaryKey()
    .references(() => sourceProducts.code, { onDelete: "cascade" }),
  /** null = follow default (see effectiveVisibility). */
  visible: boolean("visible"),
  customName: text("custom_name"),
  customDescription: text("custom_description"),
  customPrice: numeric("custom_price", { precision: 14, scale: 2 }),
  showPrice: boolean("show_price").notNull().default(false),
  customImagePath: text("custom_image_path"),
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
  reviewed: boolean("reviewed").notNull().default(false),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});

/** Maps Masefer meta_category/family/subfamily to a SICOR category. */
export const categoryMappings = pgTable(
  "category_mappings",
  {
    id: serial("id").primaryKey(),
    metaCategory: text("meta_category").notNull().default(""),
    family: text("family").notNull().default(""),
    subfamily: text("subfamily").notNull().default(""),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("category_mappings_source_uq").on(t.metaCategory, t.family, t.subfamily)],
);

/** Single-row settings (id is always 1). */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  whatsappNumber: text("whatsapp_number"),
  messageTemplate: text("message_template"),
  autoPublishNew: boolean("auto_publish_new").notNull().default(false),
  showPrices: boolean("show_prices").notNull().default(false),
});

export type SyncSummary = { new: number; changed: number; removed: number };
export type SyncChange = {
  type: "new" | "changed" | "removed";
  code: string;
  name?: string;
  fields?: string[];
};

/** Normalized data needed to apply a pending run deterministically (no re-fetch). */
export type SyncPayload = {
  /** Full normalized supplier products for every new/changed item. */
  products: unknown[];
  /** Codes removed by the supplier. */
  removed: string[];
  /** Codes present and unchanged (only their last_seen_at is bumped). */
  unchanged: string[];
};

export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  trigger: syncTrigger("trigger").notNull(),
  status: syncStatus("status").notNull(),
  startedAt: tz("started_at").notNull().defaultNow(),
  finishedAt: tz("finished_at"),
  summary: jsonb("summary").$type<SyncSummary>(),
  changes: jsonb("changes").$type<SyncChange[]>(),
  payload: jsonb("payload").$type<SyncPayload>(),
  error: text("error"),
  appliedAt: tz("applied_at"),
});
