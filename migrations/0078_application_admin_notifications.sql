-- Only future successful signed inserts enqueue a notice. Existing records are not backfilled.
CREATE TABLE IF NOT EXISTS application_admin_notice_events (
 kind TEXT NOT NULL CHECK(kind IN ('reward','discount','partner','full')),
 application_id TEXT NOT NULL,
 signed_at TEXT NOT NULL,
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 fanout_at INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(kind,application_id)
);
CREATE INDEX IF NOT EXISTS application_admin_notice_pending_events
 ON application_admin_notice_events(fanout_at,created_at);
CREATE TABLE IF NOT EXISTS application_admin_notice_batches (
 id TEXT PRIMARY KEY,
 member_id TEXT NOT NULL,
 line_id TEXT NOT NULL,
 payload_json TEXT NOT NULL,
 item_count INTEGER NOT NULL CHECK(item_count BETWEEN 1 AND 10),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','cancelled','failed')),
 attempts INTEGER NOT NULL DEFAULT 0,
 lease_until INTEGER NOT NULL DEFAULT 0,
 retry_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 finished_at INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS application_admin_notice_one_pending
 ON application_admin_notice_batches(member_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS application_admin_notice_batch_due
 ON application_admin_notice_batches(status,retry_at,lease_until);
CREATE TABLE IF NOT EXISTS application_admin_notice_deliveries (
 kind TEXT NOT NULL,
 application_id TEXT NOT NULL,
 member_id TEXT NOT NULL,
 line_id TEXT NOT NULL,
 batch_id TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','cancelled','failed')),
 created_at INTEGER NOT NULL,
 PRIMARY KEY(kind,application_id,member_id),
 FOREIGN KEY(kind,application_id) REFERENCES application_admin_notice_events(kind,application_id)
);
CREATE INDEX IF NOT EXISTS application_admin_notice_unassigned
 ON application_admin_notice_deliveries(member_id,status,batch_id,created_at);
CREATE INDEX IF NOT EXISTS application_admin_notice_pending_deliveries
 ON application_admin_notice_deliveries(status,batch_id,created_at);
CREATE TRIGGER IF NOT EXISTS reward_application_admin_notice
AFTER INSERT ON reward_applications BEGIN
 INSERT OR IGNORE INTO application_admin_notice_events(kind,application_id,signed_at)
 VALUES('reward',NEW.id,NEW.signed_at);
END;
CREATE TRIGGER IF NOT EXISTS discount_application_admin_notice
AFTER INSERT ON discount_applications BEGIN
 INSERT OR IGNORE INTO application_admin_notice_events(kind,application_id,signed_at)
 VALUES('discount',NEW.id,NEW.signed_at);
END;
CREATE TRIGGER IF NOT EXISTS partner_application_admin_notice
AFTER INSERT ON partner_applications BEGIN
 INSERT OR IGNORE INTO application_admin_notice_events(kind,application_id,signed_at)
 VALUES('partner',NEW.id,NEW.signed_at);
END;
CREATE TRIGGER IF NOT EXISTS full_application_admin_notice
AFTER INSERT ON full_applications BEGIN
 INSERT OR IGNORE INTO application_admin_notice_events(kind,application_id,signed_at)
 VALUES('full',NEW.id,NEW.signed_at);
END;
