-- ACTMASTER D1 compatibility schema
-- The remote D1 already contains users, card_contacts, activities, registrants,
-- points_ledger and store_settings. This migration only adds missing commerce
-- tables and safe indexes for the existing schema.

PRAGMA foreign_keys = ON;

CREATE INDEX IF NOT EXISTS idx_users_network_role ON users(network_id, role);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_referrer ON users(referrer_id);
CREATE INDEX IF NOT EXISTS idx_card_contacts_line ON card_contacts(line_id);
CREATE INDEX IF NOT EXISTS idx_card_contacts_network ON card_contacts(network_id);
CREATE INDEX IF NOT EXISTS idx_card_contacts_phone ON card_contacts(mobile);
CREATE INDEX IF NOT EXISTS idx_card_contacts_name ON card_contacts(name);
CREATE INDEX IF NOT EXISTS idx_activities_creator ON activities(creator_id);
CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);
CREATE INDEX IF NOT EXISTS idx_activities_time ON activities(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_registrants_activity ON registrants(activity_id);
CREATE INDEX IF NOT EXISTS idx_registrants_line ON registrants(line_id);
CREATE INDEX IF NOT EXISTS idx_registrants_phone ON registrants(phone);
CREATE INDEX IF NOT EXISTS idx_registrants_checkin ON registrants(checked_in);

CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  order_type TEXT NOT NULL DEFAULT 'tenant_annual_fee',
  buyer_id TEXT NOT NULL DEFAULT '',
  buyer_name TEXT NOT NULL DEFAULT '',
  network_id TEXT NOT NULL DEFAULT 'admin',
  product_code TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL DEFAULT '',
  gross_amount INTEGER NOT NULL DEFAULT 0,
  net_amount INTEGER NOT NULL DEFAULT 0,
  tax_amount INTEGER NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 5,
  bv INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TWD',
  payment_status TEXT NOT NULL DEFAULT 'pending_payment',
  payment_provider TEXT NOT NULL DEFAULT 'manual',
  payment_no TEXT NOT NULL DEFAULT '',
  paid_at TEXT NOT NULL DEFAULT '',
  bonus_status TEXT NOT NULL DEFAULT 'not_generated',
  sponsor_id TEXT NOT NULL DEFAULT '',
  recruiter_id TEXT NOT NULL DEFAULT '',
  placement_parent_id TEXT NOT NULL DEFAULT '',
  placement_side TEXT NOT NULL DEFAULT '',
  bonus_policy_type TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_network ON orders(network_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_no ON orders(payment_provider, payment_no)
  WHERE payment_no <> '';

CREATE TABLE IF NOT EXISTS bonus_transactions (
  tx_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL DEFAULT '',
  beneficiary_id TEXT NOT NULL DEFAULT '',
  source_user_id TEXT NOT NULL DEFAULT '',
  network_id TEXT NOT NULL DEFAULT 'admin',
  bonus_type TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL DEFAULT 0,
  bv INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'frozen',
  freeze_until TEXT NOT NULL DEFAULT '',
  settled_at TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bonus_beneficiary ON bonus_transactions(beneficiary_id);
CREATE INDEX IF NOT EXISTS idx_bonus_order ON bonus_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_bonus_status ON bonus_transactions(status);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO app_meta(key, value) VALUES ('schema_version', '0001_core_schema');
