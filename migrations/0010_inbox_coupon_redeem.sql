ALTER TABLE inbox_items ADD COLUMN coupon_status TEXT NOT NULL DEFAULT 'issued';
ALTER TABLE inbox_items ADD COLUMN coupon_redeemed_at TEXT NOT NULL DEFAULT '';
ALTER TABLE inbox_items ADD COLUMN coupon_redeemed_by TEXT NOT NULL DEFAULT '';
ALTER TABLE inbox_items ADD COLUMN coupon_redeem_note TEXT NOT NULL DEFAULT '';
