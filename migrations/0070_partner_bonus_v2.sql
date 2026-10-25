-- New signed agreements and subsequently created orders only. No legacy rewrite.
CREATE TABLE IF NOT EXISTS partner_bonus_v2_clock (
 id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 0,
 last_key TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO partner_bonus_v2_clock(id) VALUES(1);
CREATE TABLE IF NOT EXISTS partner_contract_enrollments (
 id TEXT PRIMARY KEY, member_uid TEXT NOT NULL, policy_version TEXT NOT NULL,
 signed_at TEXT NOT NULL, effective_at TEXT NOT NULL, expires_at TEXT NOT NULL,
 document_sha256 TEXT NOT NULL, evidence_ref TEXT NOT NULL,
 sponsor_uid TEXT NOT NULL, purchase_status TEXT NOT NULL,
 purchase_order_id TEXT NOT NULL DEFAULT '', verified_by TEXT NOT NULL,
 verified_at TEXT NOT NULL, verified_revision INTEGER NOT NULL DEFAULT 0,
 request_key TEXT NOT NULL UNIQUE, request_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS partner_contract_member ON partner_contract_enrollments(member_uid,effective_at);
CREATE TABLE IF NOT EXISTS partner_attribution_events (
 id TEXT PRIMARY KEY, target_uid TEXT NOT NULL, manager_uid TEXT NOT NULL,
 effective_at TEXT NOT NULL, consent_sha256 TEXT NOT NULL, evidence_ref TEXT NOT NULL,
 verified_by TEXT NOT NULL, verified_at TEXT NOT NULL,
 request_key TEXT NOT NULL UNIQUE, request_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS partner_attribution_member ON partner_attribution_events(target_uid,effective_at);
CREATE TABLE IF NOT EXISTS partner_bonus_order_snapshots (
 order_id TEXT PRIMARY KEY REFERENCES orders(order_id), contract_id TEXT NOT NULL,
 policy_version TEXT NOT NULL, recruiter_uid TEXT NOT NULL,
 buyer_uid TEXT NOT NULL, captured_at TEXT NOT NULL, snapshot_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS partner_bonus_snapshot_recruiter ON partner_bonus_order_snapshots(recruiter_uid,captured_at);
CREATE TABLE IF NOT EXISTS partner_bonus_deal_confirmations (
 order_id TEXT PRIMARY KEY REFERENCES orders(order_id), recruiter_uid TEXT NOT NULL,
 buyer_uid TEXT NOT NULL, deal_type TEXT NOT NULL, receipt_ref TEXT NOT NULL,
 service_opened_at TEXT NOT NULL, confirmed_at TEXT NOT NULL, confirmed_by TEXT NOT NULL,
 ordinal INTEGER NOT NULL, facts_json TEXT NOT NULL, plan_json TEXT NOT NULL,
 request_key TEXT NOT NULL UNIQUE, request_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS partner_bonus_confirmed_recruiter ON partner_bonus_deal_confirmations(recruiter_uid,confirmed_at);
CREATE TABLE IF NOT EXISTS partner_bonus_v2_status_events (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL, status TEXT NOT NULL,
 created_at TEXT NOT NULL, event_json TEXT NOT NULL
);
