-- One short-lived credential per member and product. No wallet mutations.
CREATE TABLE IF NOT EXISTS store_member_product_qr (
 token_hash TEXT PRIMARY KEY,
 issuer_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 product_id TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 used_request TEXT,
 UNIQUE(issuer_id,product_id)
);
