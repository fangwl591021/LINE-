CREATE TABLE IF NOT EXISTS exchange_zone_coupons (
  coupon_id INTEGER PRIMARY KEY AUTOINCREMENT,
  coupon_handle TEXT NOT NULL UNIQUE,
  post_handle TEXT NOT NULL UNIQUE,
  owner_user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  terms TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exchange_zone_coupons_owner
  ON exchange_zone_coupons(owner_user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_exchange_zone_coupons_post
  ON exchange_zone_coupons(post_handle, status);

CREATE TABLE IF NOT EXISTS exchange_zone_coupon_redemptions (
  redemption_id INTEGER PRIMARY KEY AUTOINCREMENT,
  coupon_handle TEXT NOT NULL,
  user_id TEXT NOT NULL,
  redeemed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  redeem_note TEXT NOT NULL DEFAULT '',
  UNIQUE(coupon_handle, user_id)
);

CREATE INDEX IF NOT EXISTS idx_exchange_zone_coupon_redemptions_user
  ON exchange_zone_coupon_redemptions(user_id, redeemed_at DESC);

CREATE INDEX IF NOT EXISTS idx_exchange_zone_coupon_redemptions_coupon
  ON exchange_zone_coupon_redemptions(coupon_handle, redeemed_at DESC);
