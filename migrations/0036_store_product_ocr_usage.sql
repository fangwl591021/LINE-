-- Bounded AI abuse-control state only; no DM, result, customer or transaction content.
CREATE TABLE store_product_ocr_usage (
  shop_id TEXT PRIMARY KEY REFERENCES store_shop_stores(id) ON DELETE CASCADE,
  usage_day TEXT NOT NULL,
  attempts INTEGER NOT NULL CHECK(attempts >= 1 AND attempts <= 60),
  next_allowed_at INTEGER NOT NULL
);
