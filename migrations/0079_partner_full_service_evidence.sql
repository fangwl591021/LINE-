CREATE TABLE IF NOT EXISTS partner_full_service_evidence (
 id TEXT PRIMARY KEY, member_uid TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('open','suspend','resume')),
 order_id TEXT NOT NULL DEFAULT '', effective_at TEXT NOT NULL, expires_at TEXT NOT NULL DEFAULT '',
 evidence_ref TEXT NOT NULL, recorded_at TEXT NOT NULL, recorded_by TEXT NOT NULL,
 request_key TEXT UNIQUE NOT NULL, request_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS partner_full_service_member ON partner_full_service_evidence(member_uid,effective_at,id);
CREATE UNIQUE INDEX IF NOT EXISTS partner_full_service_explicit_open ON partner_full_service_evidence(order_id) WHERE action='open';
