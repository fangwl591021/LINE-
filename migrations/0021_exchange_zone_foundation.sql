CREATE TABLE IF NOT EXISTS exchange_zone_posts (
  post_id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_handle TEXT NOT NULL UNIQUE,
  author_user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  contact_tags_json TEXT NOT NULL DEFAULT '[]',
  card_row_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'hidden', 'archived')),
  published_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exchange_zone_posts_feed
  ON exchange_zone_posts(status, published_at DESC, post_id DESC);

CREATE INDEX IF NOT EXISTS idx_exchange_zone_posts_author
  ON exchange_zone_posts(author_user_id, status, updated_at DESC);
