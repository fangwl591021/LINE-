-- Isolated online orders. No wallet writes or changes to legacy orders.
CREATE TABLE store_commerce_settings (
 shop_id TEXT PRIMARY KEY REFERENCES store_shop_stores(id),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 bank_name TEXT NOT NULL, bank_code TEXT NOT NULL, bank_account TEXT NOT NULL, bank_holder TEXT NOT NULL,
 shipping_fee_cents INTEGER NOT NULL CHECK(shipping_fee_cents>=0),
 free_shipping_cents INTEGER NOT NULL CHECK(free_shipping_cents>=0),
 version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
);
CREATE TABLE store_commerce_orders (
 id TEXT PRIMARY KEY,
 shop_id TEXT NOT NULL REFERENCES store_shop_stores(id), buyer_uid TEXT NOT NULL,
 request_key TEXT NOT NULL, request_hash TEXT NOT NULL,
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 total_cents INTEGER NOT NULL CHECK(total_cents>0),
 payment_method TEXT NOT NULL DEFAULT 'REMITTANCE' CHECK(payment_method='REMITTANCE'),
 payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending','reported','paid','cancelled')),
 fulfillment_status TEXT NOT NULL DEFAULT 'unfulfilled' CHECK(fulfillment_status IN ('unfulfilled','shipped','completed')),
 remittance_last5 TEXT NOT NULL DEFAULT '', remittance_reported_at TEXT NOT NULL DEFAULT '',
 paid_at TEXT NOT NULL DEFAULT '', received_cents INTEGER NOT NULL DEFAULT 0,
 tracking_number TEXT NOT NULL DEFAULT '', shipped_at TEXT NOT NULL DEFAULT '', completed_at TEXT NOT NULL DEFAULT '',
 version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(buyer_uid,request_key)
);
CREATE INDEX store_commerce_orders_buyer ON store_commerce_orders(buyer_uid,created_at DESC,id);
CREATE INDEX store_commerce_orders_shop ON store_commerce_orders(shop_id,created_at DESC,id);
CREATE TABLE store_commerce_events (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES store_commerce_orders(id),
 actor_uid TEXT NOT NULL, request_key TEXT NOT NULL, request_hash TEXT NOT NULL,
 action TEXT NOT NULL, order_version INTEGER NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(actor_uid,request_key), UNIQUE(order_id,order_version)
);
