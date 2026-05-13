-- Identity migration support for switching the main LIFF/Login channel.
-- Old commercial-engine UID remains traceable; point-channel UID becomes canonical.

CREATE TABLE IF NOT EXISTS user_identity_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  old_line_id TEXT NOT NULL DEFAULT '',
  new_line_id TEXT NOT NULL DEFAULT '',
  match_method TEXT NOT NULL DEFAULT '',
  confidence TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'active',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_old_line_id
ON user_identity_links(old_line_id)
WHERE old_line_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_new_line_id
ON user_identity_links(new_line_id)
WHERE new_line_id <> '';

CREATE INDEX IF NOT EXISTS idx_identity_status
ON user_identity_links(status);

ALTER TABLE users ADD COLUMN legacy_line_id TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN point_line_id TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN identity_source TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN migrated_at TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_users_legacy_line_id ON users(legacy_line_id);
CREATE INDEX IF NOT EXISTS idx_users_point_line_id ON users(point_line_id);

INSERT OR REPLACE INTO app_meta(key, value, updated_at)
VALUES ('schema_version_identity', '0003_identity_migration', CURRENT_TIMESTAMP);
