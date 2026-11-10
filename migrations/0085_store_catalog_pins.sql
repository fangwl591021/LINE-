-- Display order only. No changes to stores, partners, publication dates or roles.
CREATE TABLE IF NOT EXISTS store_catalog_pins (
  source TEXT NOT NULL CHECK(source IN ('shop','partner')),
  entity_id TEXT NOT NULL,
  pinned INTEGER NOT NULL CHECK(pinned IN (0,1)),
  version INTEGER NOT NULL CHECK(version >= 1),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  request_key TEXT NOT NULL UNIQUE,
  PRIMARY KEY(source,entity_id)
);
CREATE INDEX IF NOT EXISTS store_catalog_pins_priority ON store_catalog_pins(source,pinned,entity_id);
CREATE TABLE IF NOT EXISTS store_catalog_pin_audit (
  request_key TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK(source IN ('shop','partner')),
  entity_id TEXT NOT NULL,
  actor_uid TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  previous_pinned INTEGER NOT NULL CHECK(previous_pinned IN (0,1)),
  previous_version INTEGER NOT NULL CHECK(previous_version >= 0),
  pinned INTEGER NOT NULL CHECK(pinned IN (0,1)),
  new_version INTEGER NOT NULL CHECK(new_version >= 1),
  created_at TEXT NOT NULL
);
