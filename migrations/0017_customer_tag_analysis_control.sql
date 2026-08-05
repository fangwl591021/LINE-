CREATE TABLE IF NOT EXISTS customer_tag_profiles (
  customer_id TEXT PRIMARY KEY,
  network_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  personality TEXT NOT NULL DEFAULT '',
  hobbies TEXT NOT NULL DEFAULT '',
  wealth TEXT NOT NULL DEFAULT '',
  health TEXT NOT NULL DEFAULT '',
  career TEXT NOT NULL DEFAULT '',
  analysis_status TEXT NOT NULL DEFAULT 'not_requested' CHECK (analysis_status IN ('not_requested','queued','analyzing','completed','insufficient','failed','stale')),
  source TEXT NOT NULL DEFAULT '',
  confidence TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  customer_version INTEGER NOT NULL DEFAULT 0,
  human_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (human_confirmed IN (0,1)),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  actual_cost_microusd INTEGER NOT NULL DEFAULT 0,
  analyzed_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_tag_profiles_owner_status
  ON customer_tag_profiles(network_id, owner_user_id, analysis_status, updated_at);

CREATE TABLE IF NOT EXISTS customer_tag_analysis_settings (
  settings_key TEXT PRIMARY KEY,
  master_enabled INTEGER NOT NULL DEFAULT 0 CHECK (master_enabled IN (0,1)),
  offpeak_start_hour_taipei INTEGER NOT NULL DEFAULT 2 CHECK (offpeak_start_hour_taipei BETWEEN 0 AND 23),
  offpeak_end_hour_taipei INTEGER NOT NULL DEFAULT 5 CHECK (offpeak_end_hour_taipei BETWEEN 1 AND 24),
  max_jobs_per_run INTEGER NOT NULL DEFAULT 5 CHECK (max_jobs_per_run BETWEEN 1 AND 50),
  max_jobs_per_day INTEGER NOT NULL DEFAULT 100 CHECK (max_jobs_per_day BETWEEN 1 AND 10000),
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO customer_tag_analysis_settings (settings_key, master_enabled)
VALUES ('global', 0);

CREATE TABLE IF NOT EXISTS ai_model_price_catalog (
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_price_microusd_per_million INTEGER NOT NULL CHECK (input_price_microusd_per_million >= 0),
  output_price_microusd_per_million INTEGER NOT NULL CHECK (output_price_microusd_per_million >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  effective_at TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(provider, model)
);

CREATE TABLE IF NOT EXISTS customer_tag_analysis_batches (
  batch_id TEXT PRIMARY KEY,
  network_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','approved','paused','running','completed','cancelled','budget_exhausted')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  price_snapshot_json TEXT NOT NULL,
  eligible_customers INTEGER NOT NULL DEFAULT 0,
  estimated_input_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_microusd INTEGER NOT NULL DEFAULT 0,
  estimated_high_cost_microusd INTEGER NOT NULL DEFAULT 0,
  max_cost_microusd INTEGER NOT NULL DEFAULT 0,
  actual_input_tokens INTEGER NOT NULL DEFAULT 0,
  actual_output_tokens INTEGER NOT NULL DEFAULT 0,
  actual_cost_microusd INTEGER NOT NULL DEFAULT 0,
  approved_by TEXT NOT NULL DEFAULT '',
  approved_at TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_customer_tag_batches_owner_state
  ON customer_tag_analysis_batches(network_id, owner_user_id, state, updated_at);

CREATE TABLE IF NOT EXISTS customer_tag_analysis_jobs (
  job_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  network_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  customer_version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','leased','completed','insufficient','failed','paused','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  estimated_input_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_output_tokens INTEGER NOT NULL DEFAULT 0,
  actual_input_tokens INTEGER NOT NULL DEFAULT 0,
  actual_output_tokens INTEGER NOT NULL DEFAULT 0,
  actual_cost_microusd INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_until TEXT NOT NULL DEFAULT '',
  error_code TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT NOT NULL DEFAULT '',
  UNIQUE(batch_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_tag_jobs_claim
  ON customer_tag_analysis_jobs(status, available_at, lease_until, batch_id);
CREATE INDEX IF NOT EXISTS idx_customer_tag_jobs_owner
  ON customer_tag_analysis_jobs(network_id, owner_user_id, batch_id, status);
