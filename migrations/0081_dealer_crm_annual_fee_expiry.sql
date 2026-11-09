-- Administrative CRM date only. No backfill or entitlement changes.
ALTER TABLE users ADD COLUMN crm_annual_fee_expire_at TEXT;
