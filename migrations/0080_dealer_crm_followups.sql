CREATE TABLE IF NOT EXISTS dealer_crm_followups (
  member_uid TEXT NOT NULL,
  request_id TEXT NOT NULL,
  actor_uid TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  outcome TEXT NOT NULL,
  next_action TEXT NOT NULL,
  due_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (member_uid, request_id)
);
CREATE INDEX IF NOT EXISTS dealer_crm_followups_member_time
  ON dealer_crm_followups(member_uid, created_at DESC);
