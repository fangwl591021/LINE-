CREATE TABLE IF NOT EXISTS customer_records (
  customer_id TEXT PRIMARY KEY,
  network_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  mobile TEXT NOT NULL DEFAULT '',
  normalized_mobile TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  normalized_email TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  birthday TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  last_contact_at TEXT NOT NULL DEFAULT '',
  next_followup_at TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  external_id TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_badge TEXT NOT NULL DEFAULT '手動',
  source_batch_id TEXT NOT NULL DEFAULT '',
  is_private INTEGER NOT NULL DEFAULT 1 CHECK (is_private IN (0, 1)),
  is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0, 1)),
  marketing_consent INTEGER NOT NULL DEFAULT 0 CHECK (marketing_consent IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_customer_records_owner_updated ON customer_records(network_id, owner_user_id, archived_at, updated_at);
CREATE INDEX IF NOT EXISTS idx_customer_records_owner_mobile ON customer_records(network_id, owner_user_id, normalized_mobile);
CREATE INDEX IF NOT EXISTS idx_customer_records_owner_email ON customer_records(network_id, owner_user_id, normalized_email);
CREATE INDEX IF NOT EXISTS idx_customer_records_owner_external ON customer_records(network_id, owner_user_id, external_id);

CREATE TABLE IF NOT EXISTS customer_import_batches (
  batch_id TEXT PRIMARY KEY,
  network_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  initiated_by TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_name TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','reading','mapping','validating','ready','importing','completed','partial_failed','failed','rolled_back')),
  mapping_json TEXT NOT NULL DEFAULT '{}',
  idempotency_key TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  ready_rows INTEGER NOT NULL DEFAULT 0,
  error_rows INTEGER NOT NULL DEFAULT 0,
  created_rows INTEGER NOT NULL DEFAULT 0,
  updated_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  checkpoint INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT NOT NULL DEFAULT '',
  rolled_back_at TEXT NOT NULL DEFAULT '',
  UNIQUE(network_id, owner_user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_customer_import_batches_owner_state ON customer_import_batches(network_id, owner_user_id, state, updated_at);

CREATE TABLE IF NOT EXISTS customer_import_rows (
  batch_id TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  network_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  normalized_json TEXT NOT NULL DEFAULT '{}',
  normalized_mobile TEXT NOT NULL DEFAULT '',
  normalized_email TEXT NOT NULL DEFAULT '',
  external_id TEXT NOT NULL DEFAULT '',
  validation_json TEXT NOT NULL DEFAULT '[]',
  duplicate_customer_id TEXT NOT NULL DEFAULT '',
  decision TEXT NOT NULL DEFAULT '',
  resolution TEXT NOT NULL DEFAULT 'skip',
  status TEXT NOT NULL DEFAULT 'previewed',
  error_code TEXT NOT NULL DEFAULT '',
  customer_id TEXT NOT NULL DEFAULT '',
  before_json TEXT NOT NULL DEFAULT '',
  applied_customer_version INTEGER NOT NULL DEFAULT 0,
  committed_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(batch_id, row_number)
);

CREATE INDEX IF NOT EXISTS idx_customer_import_rows_owner_status ON customer_import_rows(network_id, owner_user_id, batch_id, status, row_number);
CREATE INDEX IF NOT EXISTS idx_customer_import_rows_batch_mobile ON customer_import_rows(batch_id, normalized_mobile);
CREATE INDEX IF NOT EXISTS idx_customer_import_rows_batch_email ON customer_import_rows(batch_id, normalized_email);
CREATE INDEX IF NOT EXISTS idx_customer_import_rows_batch_external ON customer_import_rows(batch_id, external_id);

CREATE TABLE IF NOT EXISTS customer_contact_links (
  link_id TEXT PRIMARY KEY,
  network_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  card_row_id TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT '',
  confidence TEXT NOT NULL DEFAULT '',
  confirmed_by TEXT NOT NULL DEFAULT '',
  confirmed_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(network_id, owner_user_id, customer_id, card_row_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_contact_links_owner_customer ON customer_contact_links(network_id, owner_user_id, customer_id);
