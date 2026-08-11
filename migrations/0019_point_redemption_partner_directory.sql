CREATE TABLE IF NOT EXISTS point_redemption_partners (
  partner_id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_handle TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  line_url TEXT NOT NULL DEFAULT '',
  website_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'hidden', 'suspended', 'archived')),
  sort_order INTEGER NOT NULL DEFAULT 9999,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS point_redemption_partner_locations (
  location_id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER NOT NULL,
  location_handle TEXT NOT NULL UNIQUE,
  branch_name TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  district TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  latitude REAL,
  longitude REAL,
  maps_url TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  business_hours TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'hidden', 'closed')),
  sort_order INTEGER NOT NULL DEFAULT 9999,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES point_redemption_partners(partner_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS point_redemption_partner_policies (
  partner_id INTEGER PRIMARY KEY,
  point_redeem_enabled INTEGER NOT NULL DEFAULT 0
    CHECK (point_redeem_enabled IN (0, 1)),
  max_redeem_percent INTEGER NOT NULL DEFAULT 0
    CHECK (max_redeem_percent BETWEEN 0 AND 100),
  min_spend_amount INTEGER NOT NULL DEFAULT 0
    CHECK (min_spend_amount >= 0),
  policy_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES point_redemption_partners(partner_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_point_redemption_partners_directory
  ON point_redemption_partners(status, sort_order, name);
CREATE INDEX IF NOT EXISTS idx_point_redemption_partners_category
  ON point_redemption_partners(status, category, sort_order);
CREATE INDEX IF NOT EXISTS idx_point_redemption_locations_partner
  ON point_redemption_partner_locations(partner_id, status, sort_order);
CREATE INDEX IF NOT EXISTS idx_point_redemption_locations_city
  ON point_redemption_partner_locations(status, city, district);

