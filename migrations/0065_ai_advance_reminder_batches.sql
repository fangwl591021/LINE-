-- Existing sent/attempted reminders remain intact; do not repack old uncertain sends.
ALTER TABLE ai_advance_reminders ADD COLUMN batch_id TEXT NOT NULL DEFAULT '';
CREATE INDEX ai_advance_reminder_batch_items ON ai_advance_reminders(batch_id,status);
CREATE TABLE ai_advance_reminder_batches (
 id TEXT PRIMARY KEY,
 member_id TEXT NOT NULL,
 line_id TEXT NOT NULL,
 payload_json TEXT NOT NULL,
 item_count INTEGER NOT NULL CHECK(item_count BETWEEN 1 AND 300),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0,
 lease_until INTEGER NOT NULL DEFAULT 0,
 retry_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX ai_advance_one_pending_batch ON ai_advance_reminder_batches(member_id) WHERE status='pending';
CREATE INDEX ai_advance_batch_due ON ai_advance_reminder_batches(status,retry_at,lease_until);
