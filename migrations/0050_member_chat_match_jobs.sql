-- Opt-in by opening the authenticated member directory; never changes cards or historic scores.
CREATE TABLE IF NOT EXISTS member_chat_match_jobs (
  member_id TEXT PRIMARY KEY,
  login_uid TEXT NOT NULL,
  next_run INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  lease_key TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_member_chat_match_due ON member_chat_match_jobs(next_run, lease_until);
