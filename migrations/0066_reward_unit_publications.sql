-- Explicit public snapshots, not a second member/points authority. No existing rows published.
CREATE TABLE IF NOT EXISTS reward_unit_publications (
  id TEXT PRIMARY KEY,
  target_uid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  website_url TEXT NOT NULL DEFAULT '',
  reward_terms TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','hidden')),
  version INTEGER NOT NULL CHECK(version > 0),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reward_units_public ON reward_unit_publications(status,id);
CREATE TABLE IF NOT EXISTS reward_unit_publication_audit (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  actor_uid TEXT NOT NULL,
  target_uid TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  old_version INTEGER NOT NULL,
  new_version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
