-- Additive 115.10 settlement evidence. Does not migrate old awards or send money.
CREATE TABLE IF NOT EXISTS partner_11510_statements (
 id TEXT PRIMARY KEY, target_uid TEXT NOT NULL, month TEXT NOT NULL,
 created_at TEXT NOT NULL, delivered_at TEXT NOT NULL, evidence_ref TEXT NOT NULL,
 statement_due_at TEXT NOT NULL, objection_due_at TEXT NOT NULL,
 late INTEGER NOT NULL CHECK(late IN (0,1)), total_amount REAL NOT NULL,
 created_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS partner_11510_statements_member_month ON partner_11510_statements(target_uid,month);
CREATE TABLE IF NOT EXISTS partner_11510_statement_items (
 tx_id TEXT PRIMARY KEY REFERENCES bonus_transactions(tx_id),
 statement_id TEXT NOT NULL REFERENCES partner_11510_statements(id),
 amount REAL NOT NULL CHECK(amount>0), order_id TEXT NOT NULL, bonus_type TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS partner_11510_items_statement ON partner_11510_statement_items(statement_id);
CREATE TABLE IF NOT EXISTS partner_11510_claims (
 id TEXT PRIMARY KEY, statement_id TEXT NOT NULL UNIQUE REFERENCES partner_11510_statements(id),
 completed_at TEXT NOT NULL, evidence_ref TEXT NOT NULL,
 payment_due_at TEXT, calendar_status TEXT NOT NULL, calendar_json TEXT NOT NULL,
 created_at TEXT NOT NULL, created_by TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS partner_11510_disputes (
 id TEXT PRIMARY KEY, statement_id TEXT NOT NULL REFERENCES partner_11510_statements(id),
 tx_id TEXT NOT NULL REFERENCES bonus_transactions(tx_id), reason TEXT NOT NULL,
 handling_due_at TEXT NOT NULL, evidence_ref TEXT NOT NULL, created_at TEXT NOT NULL,
 created_by TEXT NOT NULL, resolution TEXT NOT NULL DEFAULT '',
 resolved_at TEXT NOT NULL DEFAULT '', resolution_reason TEXT NOT NULL DEFAULT '',
 resolution_evidence_ref TEXT NOT NULL DEFAULT '', resolved_by TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS partner_11510_open_dispute ON partner_11510_disputes(tx_id) WHERE resolution='';
CREATE TABLE IF NOT EXISTS partner_11510_payments (
 id TEXT PRIMARY KEY, statement_id TEXT NOT NULL REFERENCES partner_11510_statements(id),
 paid_at TEXT NOT NULL, payment_ref TEXT NOT NULL, amount REAL NOT NULL,
 items_json TEXT NOT NULL, recorded_at TEXT NOT NULL, recorded_by TEXT NOT NULL,
 UNIQUE(statement_id,payment_ref)
);
CREATE TABLE IF NOT EXISTS partner_11510_settlement_commands (
 request_key TEXT PRIMARY KEY, route TEXT NOT NULL, request_json TEXT NOT NULL,
 response_json TEXT NOT NULL, created_at TEXT NOT NULL, actor_uid TEXT NOT NULL
);
