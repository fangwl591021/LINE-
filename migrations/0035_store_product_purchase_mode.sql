-- Existing products stay in-store until their owner explicitly enables online sales.
ALTER TABLE store_shop_products ADD COLUMN purchase_mode TEXT NOT NULL DEFAULT 'in_store'
  CHECK (purchase_mode IN ('in_store','online'));
