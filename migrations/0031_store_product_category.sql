-- Existing products stay unclassified; no point or ownership data changes.
ALTER TABLE store_shop_products ADD COLUMN category TEXT NOT NULL DEFAULT ''
  CHECK (category IN ('','食','宿','遊','購','行','服務','製造'));
CREATE INDEX IF NOT EXISTS store_shop_product_category ON store_shop_products(shop_id,status,category);
