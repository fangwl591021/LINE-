-- Additive 115.10 policy metadata. Existing signed contracts, orders and paid ledgers remain immutable.
CREATE TABLE IF NOT EXISTS partner_contract_11510_terms (
 contract_id TEXT PRIMARY KEY REFERENCES partner_contract_enrollments(id),
 template_version TEXT NOT NULL CHECK(template_version='115.10'),
 terms_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS partner_contract_lifecycle_events (
 id TEXT PRIMARY KEY, contract_id TEXT NOT NULL REFERENCES partner_contract_enrollments(id),
 action TEXT NOT NULL CHECK(action IN ('nonrenewal','termination')),
 effective_at TEXT NOT NULL, notice_at TEXT NOT NULL, ground TEXT NOT NULL,
 evidence_sha256 TEXT NOT NULL, evidence_ref TEXT NOT NULL, reason TEXT NOT NULL,
 verified_by TEXT NOT NULL, verified_at TEXT NOT NULL,
 request_key TEXT NOT NULL UNIQUE, request_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS partner_contract_lifecycle_contract ON partner_contract_lifecycle_events(contract_id,effective_at);
CREATE TABLE IF NOT EXISTS partner_service_year_claims (
 order_id TEXT PRIMARY KEY REFERENCES orders(order_id), buyer_uid TEXT NOT NULL,
 service_year_start TEXT NOT NULL, service_year_end TEXT NOT NULL,
 admission TEXT NOT NULL CHECK(admission IN ('new','renewal','reactivation')),
 claimed_at TEXT NOT NULL, UNIQUE(buyer_uid,service_year_start)
);
CREATE INDEX IF NOT EXISTS partner_service_year_buyer ON partner_service_year_claims(buyer_uid,service_year_end);
CREATE TABLE IF NOT EXISTS partner_bonus_11510_holds (
 order_id TEXT NOT NULL REFERENCES orders(order_id), portion TEXT NOT NULL,
 amount REAL NOT NULL CHECK(amount>0), status TEXT NOT NULL CHECK(status IN ('pending','resolved','cancelled')),
 reason TEXT NOT NULL, created_at TEXT NOT NULL, resolved_at TEXT NOT NULL DEFAULT '',
 handling_due_at TEXT NOT NULL DEFAULT '', evidence_ref TEXT NOT NULL DEFAULT '',
 PRIMARY KEY(order_id,portion)
);
CREATE TABLE IF NOT EXISTS partner_bonus_11510_resolutions (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL, portion TEXT NOT NULL,
 beneficiary_uid TEXT NOT NULL, consent_sha256 TEXT NOT NULL, evidence_ref TEXT NOT NULL,
 reason TEXT NOT NULL, verified_by TEXT NOT NULL, verified_at TEXT NOT NULL,
 request_key TEXT NOT NULL UNIQUE, request_json TEXT NOT NULL,
 UNIQUE(order_id,portion), FOREIGN KEY(order_id,portion) REFERENCES partner_bonus_11510_holds(order_id,portion)
);
