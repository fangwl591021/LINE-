CREATE TABLE IF NOT EXISTS ai_match_interests (
  interest_id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_user_id TEXT NOT NULL,
  target_card_row_id TEXT NOT NULL,
  target_owner_user_id TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'ai_match',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(sender_user_id, target_card_row_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_match_interests_target_owner
ON ai_match_interests(target_owner_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_match_interests_target_card
ON ai_match_interests(target_card_row_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_match_interests_sender
ON ai_match_interests(sender_user_id, created_at);
