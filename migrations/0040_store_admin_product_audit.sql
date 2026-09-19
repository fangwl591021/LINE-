-- Append-only provenance for explicit administrator-created catalog products.
-- No owner, identity, points, order or existing-product updates.
CREATE TABLE IF NOT EXISTS store_admin_product_audit (
 product_id TEXT PRIMARY KEY REFERENCES store_shop_products(id),
 shop_id TEXT NOT NULL REFERENCES store_shop_stores(id),
 actor_uid TEXT NOT NULL,
 owner_uid TEXT NOT NULL,
 request_key TEXT NOT NULL,
 payload_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(shop_id,request_key)
);
