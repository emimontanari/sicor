ALTER TABLE "source_products" ADD COLUMN "supplier_documents" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "source_products" ADD COLUMN "local_documents" jsonb DEFAULT '[]'::jsonb;