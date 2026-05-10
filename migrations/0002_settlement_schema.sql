CREATE TABLE IF NOT EXISTS settlement_batches (
  batch_id TEXT PRIMARY KEY,
  period TEXT NOT NULL,
  network_id TEXT DEFAULT 'admin',
  status TEXT DEFAULT 'draft',
  gross_amount REAL DEFAULT 0,
  withholding_tax REAL DEFAULT 0,
  nhi_fee REAL DEFAULT 0,
  net_amount REAL DEFAULT 0,
  item_count INTEGER DEFAULT 0,
  created_by TEXT DEFAULT '',
  locked_at TEXT DEFAULT '',
  paid_at TEXT DEFAULT '',
  raw_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settlement_items (
  item_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  tx_id TEXT NOT NULL UNIQUE,
  beneficiary_id TEXT NOT NULL,
  beneficiary_name TEXT DEFAULT '',
  network_id TEXT DEFAULT 'admin',
  gross_amount REAL DEFAULT 0,
  withholding_tax REAL DEFAULT 0,
  nhi_fee REAL DEFAULT 0,
  net_amount REAL DEFAULT 0,
  invoice_required INTEGER DEFAULT 0,
  kyc_status TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  raw_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(batch_id) REFERENCES settlement_batches(batch_id)
);

CREATE INDEX IF NOT EXISTS idx_settlement_batches_period
  ON settlement_batches(period, network_id, status);

CREATE INDEX IF NOT EXISTS idx_settlement_items_batch
  ON settlement_items(batch_id, beneficiary_id);
