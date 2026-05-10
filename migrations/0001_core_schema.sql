-- ACTMASTER D1 core schema
-- Phase 1: move identity, cards, activities, registrations, orders and bonus ledger away from GAS.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  line_id TEXT UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL DEFAULT '',
  birthday TEXT NOT NULL DEFAULT '',
  company_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',
  network_id TEXT NOT NULL DEFAULT 'admin',
  store_id TEXT NOT NULL DEFAULT '',
  referrer_id TEXT NOT NULL DEFAULT '',
  profile_status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'manual',
  claimed_card_id TEXT NOT NULL DEFAULT '',
  socials_json TEXT NOT NULL DEFAULT '[]',
  telegram_token TEXT NOT NULL DEFAULT '',
  telegram_chat_id TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_network_role ON users(network_id, role);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_referrer ON users(referrer_id);

CREATE TABLE IF NOT EXISTS cards (
  card_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL DEFAULT '',
  creator_user_id TEXT NOT NULL DEFAULT '',
  network_id TEXT NOT NULL DEFAULT 'admin',
  name TEXT NOT NULL DEFAULT '',
  english_name TEXT NOT NULL DEFAULT '',
  company_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  mobile TEXT NOT NULL DEFAULT '',
  company_phone TEXT NOT NULL DEFAULT '',
  extension TEXT NOT NULL DEFAULT '',
  fax TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  social_accounts TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  config_json TEXT NOT NULL DEFAULT '{}',
  tags TEXT NOT NULL DEFAULT '',
  is_bound INTEGER NOT NULL DEFAULT 0,
  is_private INTEGER NOT NULL DEFAULT 0,
  template_draft INTEGER NOT NULL DEFAULT 0,
  safety_status TEXT NOT NULL DEFAULT 'pending',
  source TEXT NOT NULL DEFAULT 'manual',
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_cards_owner ON cards(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_cards_creator ON cards(creator_user_id);
CREATE INDEX IF NOT EXISTS idx_cards_network ON cards(network_id);
CREATE INDEX IF NOT EXISTS idx_cards_phone ON cards(mobile);
CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);
CREATE INDEX IF NOT EXISTS idx_cards_bound ON cards(is_bound);

CREATE TABLE IF NOT EXISTS activities (
  activity_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL DEFAULT '',
  network_id TEXT NOT NULL DEFAULT 'admin',
  name TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '例會',
  default_identity TEXT NOT NULL DEFAULT '會員',
  fee_type TEXT NOT NULL DEFAULT '免費',
  price INTEGER NOT NULL DEFAULT 0,
  start_time TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published',
  is_batch INTEGER NOT NULL DEFAULT 0,
  parent_activity_id TEXT NOT NULL DEFAULT '',
  nfc_checkin_start TEXT NOT NULL DEFAULT '',
  nfc_checkin_end TEXT NOT NULL DEFAULT '',
  nfc_same_day_only INTEGER NOT NULL DEFAULT 1,
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_activities_owner ON activities(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_activities_network_status ON activities(network_id, status);
CREATE INDEX IF NOT EXISTS idx_activities_time ON activities(start_time, end_time);

CREATE TABLE IF NOT EXISTS activity_registrations (
  registration_id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  identity TEXT NOT NULL DEFAULT '會員',
  payment_status TEXT NOT NULL DEFAULT '',
  checkin_status INTEGER NOT NULL DEFAULT 0,
  checked_in_at TEXT NOT NULL DEFAULT '',
  cancelled_at TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(activity_id, user_id),
  FOREIGN KEY(activity_id) REFERENCES activities(activity_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_registrations_activity ON activity_registrations(activity_id);
CREATE INDEX IF NOT EXISTS idx_registrations_user ON activity_registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_registrations_phone ON activity_registrations(phone);
CREATE INDEX IF NOT EXISTS idx_registrations_checkin ON activity_registrations(checkin_status);

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
