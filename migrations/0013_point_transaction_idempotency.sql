-- Phase 2C: point transaction idempotency and single-use cashier sessions.
-- This migration is intentionally additive. It does not rewrite balances or old ledger rows.

CREATE TABLE IF NOT EXISTS store_point_cashier_sessions (
  session_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'admin',
  network_id TEXT NOT NULL DEFAULT 'admin',
  actor_user_id TEXT NOT NULL DEFAULT '',
  actor_point_user_id TEXT NOT NULL DEFAULT '',
  customer_user_id TEXT NOT NULL DEFAULT '',
  customer_point_user_id TEXT NOT NULL DEFAULT '',
  customer_point_source TEXT NOT NULL DEFAULT 'mother',
  operation_type TEXT NOT NULL DEFAULT 'any',
  expected_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'prepared',
  balance REAL NOT NULL DEFAULT 0,
  mother_balance REAL NOT NULL DEFAULT 0,
  local_balance REAL NOT NULL DEFAULT 0,
  actor_balance REAL NOT NULL DEFAULT 0,
  actor_can_operate INTEGER NOT NULL DEFAULT 0,
  mother_ready INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL DEFAULT '',
  transaction_id TEXT NOT NULL DEFAULT '',
  result_json TEXT NOT NULL DEFAULT '{}',
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL DEFAULT '',
  processing_at TEXT NOT NULL DEFAULT '',
  consumed_at TEXT NOT NULL DEFAULT '',
  completed_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_store_point_cashier_sessions_actor_status
  ON store_point_cashier_sessions(actor_user_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_store_point_cashier_sessions_customer
  ON store_point_cashier_sessions(customer_point_user_id, created_at);

CREATE TABLE IF NOT EXISTS store_point_cashier_transactions (
  transaction_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'admin',
  network_id TEXT NOT NULL DEFAULT 'admin',
  idempotency_key TEXT NOT NULL DEFAULT '',
  cashier_session_id TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT NOT NULL DEFAULT '',
  actor_point_user_id TEXT NOT NULL DEFAULT '',
  customer_user_id TEXT NOT NULL DEFAULT '',
  customer_point_user_id TEXT NOT NULL DEFAULT '',
  operation_type TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  points REAL NOT NULL DEFAULT 0,
  before_balance REAL NOT NULL DEFAULT 0,
  after_balance REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'mother',
  source_ref TEXT NOT NULL DEFAULT '',
  external_transaction_id TEXT NOT NULL DEFAULT '',
  request_fingerprint TEXT NOT NULL DEFAULT '',
  response_json TEXT NOT NULL DEFAULT '{}',
  external_result_json TEXT NOT NULL DEFAULT '{}',
  reconciliation_status TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'reserved',
  error_code TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_point_tx_tenant_actor_key
  ON store_point_cashier_transactions(tenant_id, actor_user_id, idempotency_key)
  WHERE idempotency_key <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_point_tx_session_once
  ON store_point_cashier_transactions(cashier_session_id)
  WHERE cashier_session_id <> '';

CREATE INDEX IF NOT EXISTS idx_store_point_tx_customer_time
  ON store_point_cashier_transactions(customer_point_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_store_point_tx_status_time
  ON store_point_cashier_transactions(status, updated_at);

CREATE TABLE IF NOT EXISTS point_sync_event_keys (
  event_key TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT '',
  source_ref TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_point_sync_event_keys_source_ref
  ON point_sync_event_keys(source, source_ref);
