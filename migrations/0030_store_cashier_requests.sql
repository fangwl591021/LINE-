CREATE TABLE IF NOT EXISTS store_cashier_requests (
 actor_id TEXT NOT NULL, request_id TEXT NOT NULL, customer_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','sending','succeeded','failed','unknown')),
 result_json TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(actor_id,request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS store_cashier_one_open_customer ON store_cashier_requests(customer_id)
 WHERE status IN ('pending','sending','unknown');
