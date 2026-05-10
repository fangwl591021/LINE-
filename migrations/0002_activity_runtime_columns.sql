-- Activity runtime columns for D1-first activity management.

ALTER TABLE activities ADD COLUMN nfc_checkin_start TEXT NOT NULL DEFAULT '';
ALTER TABLE activities ADD COLUMN nfc_checkin_end TEXT NOT NULL DEFAULT '';
ALTER TABLE activities ADD COLUMN nfc_same_day_only INTEGER NOT NULL DEFAULT 1;

ALTER TABLE registrants ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE registrants ADD COLUMN cancelled_at TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_activities_nfc_window ON activities(nfc_checkin_start, nfc_checkin_end);
CREATE INDEX IF NOT EXISTS idx_registrants_status ON registrants(status);
