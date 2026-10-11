-- Preserve every order/event. Allow zero cash due for full point payment.
PRAGMA defer_foreign_keys = ON;
-- Rebuild the direct child too: SQLite's deferred FK counter retains a parent
-- DROP violation even when a replacement parent has the same rows/name.
CREATE TABLE store_commerce_events_points_backup AS SELECT * FROM store_commerce_events;
DROP TABLE store_commerce_events;
CREATE TABLE store_commerce_orders_points_v1 (
 id TEXT PRIMARY KEY,
 shop_id TEXT NOT NULL REFERENCES store_shop_stores(id), buyer_uid TEXT NOT NULL,
 request_key TEXT NOT NULL, request_hash TEXT NOT NULL,
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 total_cents INTEGER NOT NULL CHECK(total_cents>=0),
 payment_method TEXT NOT NULL DEFAULT 'REMITTANCE' CHECK(payment_method='REMITTANCE'),
 payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending','reported','paid','cancelled')),
 fulfillment_status TEXT NOT NULL DEFAULT 'unfulfilled' CHECK(fulfillment_status IN ('unfulfilled','shipped','completed')),
 remittance_last5 TEXT NOT NULL DEFAULT '', remittance_reported_at TEXT NOT NULL DEFAULT '',
 paid_at TEXT NOT NULL DEFAULT '', received_cents INTEGER NOT NULL DEFAULT 0,
 tracking_number TEXT NOT NULL DEFAULT '', shipped_at TEXT NOT NULL DEFAULT '', completed_at TEXT NOT NULL DEFAULT '',
 version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 points_status TEXT NOT NULL DEFAULT 'none' CHECK(points_status IN ('none','pending','debited','failed','unknown','refunding','refunded','refund_unknown')),
 UNIQUE(buyer_uid,request_key)
);
INSERT INTO store_commerce_orders_points_v1 (
 id,shop_id,buyer_uid,request_key,request_hash,snapshot_json,total_cents,payment_method,payment_status,fulfillment_status,
 remittance_last5,remittance_reported_at,paid_at,received_cents,tracking_number,shipped_at,completed_at,version,created_at,updated_at
) SELECT id,shop_id,buyer_uid,request_key,request_hash,snapshot_json,total_cents,payment_method,payment_status,fulfillment_status,
 remittance_last5,remittance_reported_at,paid_at,received_cents,tracking_number,shipped_at,completed_at,version,created_at,updated_at
 FROM store_commerce_orders;
DROP TABLE store_commerce_orders;
ALTER TABLE store_commerce_orders_points_v1 RENAME TO store_commerce_orders;
CREATE INDEX store_commerce_orders_buyer ON store_commerce_orders(buyer_uid,created_at DESC,id);
CREATE INDEX store_commerce_orders_shop ON store_commerce_orders(shop_id,created_at DESC,id);
CREATE TABLE store_commerce_events (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES store_commerce_orders(id),
 actor_uid TEXT NOT NULL, request_key TEXT NOT NULL, request_hash TEXT NOT NULL,
 action TEXT NOT NULL, order_version INTEGER NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(actor_uid,request_key), UNIQUE(order_id,order_version)
);
INSERT INTO store_commerce_events SELECT * FROM store_commerce_events_points_backup;
DROP TABLE store_commerce_events_points_backup;
CREATE TABLE store_commerce_point_operations (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES store_commerce_orders(id),
 kind TEXT NOT NULL CHECK(kind IN ('debit','refund')),
 buyer_uid TEXT NOT NULL, merchant_uid TEXT NOT NULL, operator_uid TEXT NOT NULL, point_identity TEXT NOT NULL,
 points INTEGER NOT NULL CHECK(points<>0),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','succeeded','failed','unknown')),
 balance_before INTEGER, balance_after_estimate INTEGER,
 mother_receipt_id TEXT UNIQUE, receipt_json TEXT CHECK(receipt_json IS NULL OR json_valid(receipt_json)),
 original_operation_id TEXT REFERENCES store_commerce_point_operations(id),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 CHECK((kind='debit' AND points<0 AND original_operation_id IS NULL) OR (kind='refund' AND points>0 AND original_operation_id IS NOT NULL)),
 UNIQUE(order_id,kind)
);
