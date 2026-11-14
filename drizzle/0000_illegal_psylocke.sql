CREATE TYPE "public"."product_status" AS ENUM('active', 'discontinued');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('checking', 'pending', 'applied', 'discarded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sync_trigger" AS ENUM('scheduled', 'manual');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug"),
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "category_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"meta_category" text DEFAULT '' NOT NULL,
	"family" text DEFAULT '' NOT NULL,
	"subfamily" text DEFAULT '' NOT NULL,
	"category_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_overrides" (
	"product_code" text PRIMARY KEY NOT NULL,
	"visible" boolean,
	"custom_name" text,
	"custom_description" text,
	"custom_price" numeric(14, 2),
	"show_price" boolean DEFAULT false NOT NULL,
	"custom_image_path" text,
	"category_id" integer,
	"reviewed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"whatsapp_number" text,
	"message_template" text,
	"auto_publish_new" boolean DEFAULT false NOT NULL,
	"show_prices" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_products" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"meta_category" text,
	"family" text,
	"subfamily" text,
	"unit" text,
	"supplier_price" numeric(14, 2),
	"currency" text,
	"supplier_images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"local_images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "product_status" DEFAULT 'active' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content_hash" text
);
--> statement-breakpoint
CREATE TABLE "source_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_code" text NOT NULL,
	"sku" text NOT NULL,
	"color" text,
	"size" text,
	"text" text,
	"stock_total" integer,
	"published" boolean DEFAULT true NOT NULL,
	CONSTRAINT "source_variants_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"trigger" "sync_trigger" NOT NULL,
	"status" "sync_status" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"summary" jsonb,
	"changes" jsonb,
	"error" text,
	"applied_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "category_mappings" ADD CONSTRAINT "category_mappings_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_overrides" ADD CONSTRAINT "product_overrides_product_code_source_products_code_fk" FOREIGN KEY ("product_code") REFERENCES "public"."source_products"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_overrides" ADD CONSTRAINT "product_overrides_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_variants" ADD CONSTRAINT "source_variants_product_code_source_products_code_fk" FOREIGN KEY ("product_code") REFERENCES "public"."source_products"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_mappings_source_uq" ON "category_mappings" USING btree ("meta_category","family","subfamily");--> statement-breakpoint
CREATE INDEX "source_variants_product_code_idx" ON "source_variants" USING btree ("product_code");