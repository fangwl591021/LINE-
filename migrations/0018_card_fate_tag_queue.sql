ALTER TABLE card_contacts ADD COLUMN fate_analysis_status TEXT NOT NULL DEFAULT 'not_requested';
ALTER TABLE card_contacts ADD COLUMN fate_analysis_error TEXT NOT NULL DEFAULT '';
ALTER TABLE card_contacts ADD COLUMN fate_analyzed_at TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS card_fate_tag_settings (
  settings_key TEXT PRIMARY KEY,
  master_enabled INTEGER NOT NULL DEFAULT 1 CHECK (master_enabled IN (0,1)),
  offpeak_start_hour_taipei INTEGER NOT NULL DEFAULT 2 CHECK (offpeak_start_hour_taipei BETWEEN 0 AND 23),
  offpeak_end_hour_taipei INTEGER NOT NULL DEFAULT 5 CHECK (offpeak_end_hour_taipei BETWEEN 1 AND 24),
  max_jobs_per_run INTEGER NOT NULL DEFAULT 5 CHECK (max_jobs_per_run BETWEEN 1 AND 20),
  max_jobs_per_day INTEGER NOT NULL DEFAULT 100 CHECK (max_jobs_per_day BETWEEN 1 AND 1000),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 5),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO card_fate_tag_settings (settings_key) VALUES ('global');

CREATE TABLE IF NOT EXISTS card_fate_tag_jobs (
  job_id TEXT PRIMARY KEY,
  card_row_id TEXT NOT NULL UNIQUE,
  network_id TEXT NOT NULL DEFAULT 'admin',
  owner_user_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','leased','completed','insufficient','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_until TEXT NOT NULL DEFAULT '',
  error_code TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_card_fate_tag_jobs_claim
  ON card_fate_tag_jobs(status, available_at, lease_until, updated_at);
CREATE INDEX IF NOT EXISTS idx_card_fate_tag_jobs_owner
  ON card_fate_tag_jobs(network_id, owner_user_id, status, updated_at);

INSERT OR IGNORE INTO card_fate_tag_jobs (job_id, card_row_id, network_id, owner_user_id)
SELECT
  'CFT_' || lower(hex(randomblob(16))),
  row_id,
  COALESCE(NULLIF(network_id, ''), 'admin'),
  COALESCE(NULLIF(owner_user_id, ''), NULLIF(creator_id, ''), NULLIF(line_id, ''), '')
FROM card_contacts
WHERE COALESCE(archived_at, '') = ''
  AND LOWER(COALESCE(source_type, '')) <> 'referral_placeholder'
  AND (COALESCE(name, '') <> '' OR COALESCE(mobile, '') <> '' OR COALESCE(birthday, '') <> '' OR COALESCE(company_name, '') <> '' OR COALESCE(title, '') <> '')
  AND (COALESCE(personality, '') = '' OR COALESCE(hobbies, '') = '' OR COALESCE(wealth, '') = '' OR COALESCE(health, '') = '' OR COALESCE(career, '') = '');

UPDATE card_contacts
SET fate_analysis_status = 'queued', fate_analysis_error = ''
WHERE row_id IN (SELECT card_row_id FROM card_fate_tag_jobs WHERE status = 'pending');
