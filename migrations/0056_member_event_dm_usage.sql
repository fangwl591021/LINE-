-- Isolated AI attempt allowance, no activity/registration/member/image changes.
CREATE TABLE member_event_dm_usage (
  member_id TEXT PRIMARY KEY REFERENCES users(row_id),
  usage_day TEXT NOT NULL,
  attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 20),
  next_allowed_at INTEGER NOT NULL
);
