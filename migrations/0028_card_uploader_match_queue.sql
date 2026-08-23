CREATE TABLE IF NOT EXISTS card_uploader_match_jobs (
  job_id TEXT PRIMARY KEY,
  card_row_id TEXT NOT NULL UNIQUE,
  network_id TEXT NOT NULL DEFAULT 'admin',
  owner_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting_tags',
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_until TEXT NOT NULL DEFAULT '',
  error_code TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_card_uploader_match_jobs_claim
  ON card_uploader_match_jobs(status, available_at, lease_until, updated_at);

CREATE INDEX IF NOT EXISTS idx_card_uploader_match_jobs_owner
  ON card_uploader_match_jobs(owner_user_id, status, updated_at);
