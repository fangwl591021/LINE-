-- Additive only. No member, registration or point data changes.
CREATE TABLE IF NOT EXISTS activity_share_links (
  code TEXT PRIMARY KEY NOT NULL CHECK(length(code) = 16),
  network_id TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  referrer_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(network_id, activity_id, referrer_id)
);
