CREATE TABLE IF NOT EXISTS partner_onboarding_ai_usage (
  actor_uid TEXT PRIMARY KEY,
  usage_day TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_allowed_at INTEGER NOT NULL DEFAULT 0
);
