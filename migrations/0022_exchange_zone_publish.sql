ALTER TABLE exchange_zone_posts ADD COLUMN expires_at TEXT NOT NULL DEFAULT '';
ALTER TABLE exchange_zone_posts ADD COLUMN point_cost INTEGER NOT NULL DEFAULT 0;
ALTER TABLE exchange_zone_posts ADD COLUMN publish_operation_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_exchange_zone_posts_publish_operation
  ON exchange_zone_posts(publish_operation_id)
  WHERE publish_operation_id <> '';

CREATE INDEX IF NOT EXISTS idx_exchange_zone_posts_active_feed
  ON exchange_zone_posts(status, expires_at, published_at DESC, post_id DESC);

CREATE TABLE IF NOT EXISTS exchange_zone_publish_operations (
  operation_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  post_handle TEXT NOT NULL UNIQUE,
  point_cost INTEGER NOT NULL DEFAULT 10 CHECK (point_cost > 0),
  point_type TEXT NOT NULL DEFAULT 'gift_money',
  state TEXT NOT NULL DEFAULT 'reserved'
    CHECK (state IN ('reserved', 'charging', 'debit_uncertain', 'charged', 'published', 'failed', 'compensated', 'compensation_pending')),
  failure_code TEXT NOT NULL DEFAULT '',
  point_response_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(author_user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_exchange_zone_publish_operations_state
  ON exchange_zone_publish_operations(state, updated_at DESC);
