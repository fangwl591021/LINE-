-- Catalog administration only. No changes to users, points, orders or existing catalog rows.
CREATE TABLE IF NOT EXISTS store_catalog_admin_audit (
 id TEXT PRIMARY KEY,
 request_key TEXT NOT NULL UNIQUE,
 actor_uid TEXT NOT NULL,
 shop_id TEXT NOT NULL,
 target_type TEXT NOT NULL CHECK(target_type IN ('store','product')),
 target_id TEXT NOT NULL,
 old_version INTEGER NOT NULL,
 new_version INTEGER NOT NULL,
 payload_json TEXT NOT NULL,
 before_json TEXT NOT NULL,
 after_json TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS store_catalog_admin_audit_target
 ON store_catalog_admin_audit(shop_id,target_type,target_id,created_at);
