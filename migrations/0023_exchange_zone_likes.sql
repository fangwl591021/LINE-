CREATE TABLE IF NOT EXISTS exchange_zone_post_likes (
  like_id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_handle TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(post_handle, user_id)
);

CREATE INDEX IF NOT EXISTS idx_exchange_zone_post_likes_post
ON exchange_zone_post_likes(post_handle);

CREATE INDEX IF NOT EXISTS idx_exchange_zone_post_likes_user
ON exchange_zone_post_likes(user_id);
