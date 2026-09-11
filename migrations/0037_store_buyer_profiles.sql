-- Private opt-in contact data only. No backfill and no changes to users/cards/orders/points.
CREATE TABLE IF NOT EXISTS store_buyer_profiles (
 owner_uid TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 phone TEXT NOT NULL,
 email TEXT NOT NULL DEFAULT '',
 postal_code TEXT NOT NULL DEFAULT '',
 city TEXT NOT NULL,
 district TEXT NOT NULL,
 address TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 updated_at TEXT NOT NULL,
 consented_at TEXT NOT NULL
);
