-- Additive publishing review only. No updates to stores, products, identities or ledgers.
CREATE TABLE IF NOT EXISTS store_listing_reviews (
 scope TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 policy_version TEXT NOT NULL,
 decision TEXT NOT NULL CHECK(decision IN ('allow','reject','manual','error')),
 review_json TEXT NOT NULL,
 actor_uid TEXT NOT NULL,
 reviewed_at INTEGER NOT NULL,
 PRIMARY KEY(scope,content_hash,policy_version)
);
CREATE TABLE IF NOT EXISTS store_listing_review_usage (
 actor_uid TEXT PRIMARY KEY,
 usage_day TEXT NOT NULL,
 attempts INTEGER NOT NULL CHECK(attempts>0),
 next_allowed_at INTEGER NOT NULL
);
