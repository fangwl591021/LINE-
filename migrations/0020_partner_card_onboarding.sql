ALTER TABLE point_redemption_partners
  ADD COLUMN contact_name TEXT NOT NULL DEFAULT '';

ALTER TABLE point_redemption_partners
  ADD COLUMN contact_email TEXT NOT NULL DEFAULT '';

ALTER TABLE point_redemption_partners
  ADD COLUMN tax_id TEXT NOT NULL DEFAULT '';

ALTER TABLE point_redemption_partners
  ADD COLUMN source_card_row_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_point_redemption_partners_source_card
  ON point_redemption_partners(source_card_row_id);
