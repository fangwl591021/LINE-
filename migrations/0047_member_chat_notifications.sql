-- Opt-in only. No changes to members, identities, cards, points or message contents.
CREATE TABLE IF NOT EXISTS member_chat_notifications (
  member_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  line_id TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS member_chat_notification_jobs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  thread_id TEXT NOT NULL REFERENCES member_chat_threads(id),
  recipient_id TEXT NOT NULL,
  line_id TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  first_seq INTEGER NOT NULL,
  last_seq INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','cancelled','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  due_at INTEGER NOT NULL,
  target_url TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(thread_id,recipient_id,bucket)
);
CREATE INDEX IF NOT EXISTS idx_member_chat_notification_due ON member_chat_notification_jobs(status,due_at,lease_until);
CREATE TRIGGER IF NOT EXISTS member_chat_enqueue_notification
AFTER INSERT ON member_chat_messages
BEGIN
  INSERT INTO member_chat_notification_jobs(thread_id,recipient_id,line_id,bucket,first_seq,last_seq,due_at)
  SELECT t.id,p.member_id,p.line_id,CAST(unixepoch()/300 AS INTEGER),NEW.seq,NEW.seq,unixepoch()+30
  FROM member_chat_threads t JOIN member_chat_notifications p
    ON p.member_id=iif(t.member_a=NEW.sender_id,t.member_b,t.member_a)
  WHERE t.id=NEW.thread_id AND p.enabled=1
  ON CONFLICT(thread_id,recipient_id,bucket) DO UPDATE SET
    last_seq=excluded.last_seq,
    id=iif(status='cancelled',excluded.id,id),
    first_seq=iif(status='cancelled',excluded.first_seq,first_seq),
    line_id=iif(status='cancelled',excluded.line_id,line_id),
    attempts=iif(status='cancelled',0,attempts),
    due_at=iif(status='cancelled',excluded.due_at,due_at),
    lease_until=iif(status='cancelled',0,lease_until),
    target_url=iif(status='cancelled',NULL,target_url),
    status=iif(status='cancelled','pending',status);
END;
CREATE TRIGGER IF NOT EXISTS member_chat_cancel_notification
AFTER UPDATE ON member_chat_notifications
WHEN NEW.enabled=0 OR NEW.line_id<>OLD.line_id
BEGIN
  UPDATE member_chat_notification_jobs SET status='cancelled'
  WHERE recipient_id=NEW.member_id AND status='pending';
END;
