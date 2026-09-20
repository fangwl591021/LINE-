-- Game attempts only. Rewards reuse point_awards (0004); no new balance/member system.
CREATE TABLE IF NOT EXISTS daily_tank_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  challenge_date TEXT NOT NULL,
  seed INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_daily_tank_sessions_member
  ON daily_tank_sessions(tenant_id, member_id, created_at DESC);
