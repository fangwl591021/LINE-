-- Only signature-verified LINE follow events; no access tokens or message text.
CREATE TABLE IF NOT EXISTS friend_referral_events (
  event_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_time_ms INTEGER NOT NULL,
  is_unblocked INTEGER NOT NULL,
  last_attempt_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_friend_referral_events_user_time
  ON friend_referral_events(user_id,event_time_ms);
