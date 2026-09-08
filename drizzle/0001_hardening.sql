-- Self-referencing category tree (subcategories).
ALTER TABLE "categories"
  ADD CONSTRAINT "categories_parent_id_categories_id_fk"
  FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- A category may not be its own parent.
ALTER TABLE "categories"
  ADD CONSTRAINT "categories_parent_not_self" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");
--> statement-breakpoint

-- Trigram indexes make ILIKE '%term%' search over the catalogue index-backed
-- instead of a sequential scan. Required for section 17 (fast search).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_name_trgm_idx" ON "products" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_sku_trgm_idx" ON "products" USING gin ("sku" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_barcode_trgm_idx" ON "products" USING gin ("barcode" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_part_number_trgm_idx" ON "products" USING gin ("part_number" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_model_trgm_idx" ON "products" USING gin ("model" gin_trgm_ops);
--> statement-breakpoint

-- Exactly one default location.
CREATE UNIQUE INDEX IF NOT EXISTS "locations_single_default_idx"
  ON "locations" ("is_default") WHERE "is_default" = true;
--> statement-breakpoint

-- The stock ledger is append-only. Enforced in the database so that no
-- application bug, ad-hoc query or future migration can quietly rewrite
-- inventory history.
CREATE OR REPLACE FUNCTION shp_block_ledger_rewrite() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'stock_transactions is append-only; record a correcting ADJUSTMENT instead'
    USING ERRCODE = '0A000';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER stock_transactions_immutable
  BEFORE UPDATE OR DELETE ON "stock_transactions"
  FOR EACH ROW EXECUTE FUNCTION shp_block_ledger_rewrite();
