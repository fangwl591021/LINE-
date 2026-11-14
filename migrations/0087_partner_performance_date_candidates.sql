-- Administrative candidates only. No payment, bonus or settlement record is changed.
CREATE TABLE partner_bonus_performance_date_events (
 event_id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(order_id),
 version INTEGER NOT NULL CHECK(version > 0),
 previous_precision TEXT NOT NULL, previous_value TEXT NOT NULL,
 precision TEXT NOT NULL CHECK(precision IN ('month','day','minute','none')),
 value TEXT NOT NULL, reason TEXT NOT NULL, recorded_at TEXT NOT NULL,
 recorded_by TEXT NOT NULL, request_key TEXT NOT NULL UNIQUE, request_json TEXT NOT NULL,
 UNIQUE(order_id,version)
);
CREATE INDEX partner_performance_date_order_version ON partner_bonus_performance_date_events(order_id,version DESC);
