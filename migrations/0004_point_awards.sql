CREATE TABLE IF NOT EXISTS point_awards (
  award_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  card_id TEXT NOT NULL DEFAULT '',
  award_type TEXT NOT NULL DEFAULT 'card_scan_create',
  points REAL NOT NULL DEFAULT 0,
  point_type TEXT NOT NULL DEFAULT 'system_point',
  status TEXT NOT NULL DEFAULT 'pending',
  response_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_point_awards_unique_card_scan
  ON point_awards(user_id, card_id, award_type)
  WHERE user_id <> '' AND card_id <> '';

CREATE INDEX IF NOT EXISTS idx_point_awards_user_status
  ON point_awards(user_id, status, created_at);

INSERT OR REPLACE INTO app_meta(key, value, updated_at)
VALUES ('schema_point_awards', '0004_point_awards', CURRENT_TIMESTAMP);
