CREATE TABLE IF NOT EXISTS ai_match_pair_cache (
  requester_user_id TEXT NOT NULL,
  pool_scope TEXT NOT NULL CHECK (pool_scope IN ('own', 'public')),
  intent_hash TEXT NOT NULL,
  candidate_card_row_id TEXT NOT NULL,
  candidate_version TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  result_source TEXT NOT NULL DEFAULT 'ai',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (requester_user_id, pool_scope, intent_hash, candidate_card_row_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_match_pair_cache_request
ON ai_match_pair_cache(requester_user_id, pool_scope, intent_hash, updated_at);

CREATE INDEX IF NOT EXISTS idx_ai_match_pair_cache_candidate
ON ai_match_pair_cache(candidate_card_row_id, candidate_version);
