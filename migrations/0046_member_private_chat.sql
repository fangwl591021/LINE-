-- Private member conversations only. Existing inbox/points/cards are untouched.
CREATE TABLE IF NOT EXISTS member_chat_preferences (
  member_id TEXT PRIMARY KEY,
  accepting INTEGER NOT NULL DEFAULT 1 CHECK(accepting IN (0,1))
);
CREATE TABLE IF NOT EXISTS member_chat_threads (
  id TEXT PRIMARY KEY,
  member_a TEXT NOT NULL,
  member_b TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(member_a,member_b),
  CHECK(member_a < member_b)
);
CREATE INDEX IF NOT EXISTS idx_member_chat_a ON member_chat_threads(member_a,id);
CREATE INDEX IF NOT EXISTS idx_member_chat_b ON member_chat_threads(member_b,id);
CREATE TABLE IF NOT EXISTS member_chat_messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL REFERENCES member_chat_threads(id),
  sender_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TEXT,
  UNIQUE(sender_id,client_id)
);
CREATE INDEX IF NOT EXISTS idx_member_chat_thread_seq ON member_chat_messages(thread_id,seq);
CREATE INDEX IF NOT EXISTS idx_member_chat_sender_time ON member_chat_messages(sender_id,created_at);
CREATE TABLE IF NOT EXISTS member_chat_blocks (
  member_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(member_id,blocked_id),
  CHECK(member_id <> blocked_id)
);
CREATE TABLE IF NOT EXISTS member_chat_reports (
  reporter_id TEXT NOT NULL,
  message_seq INTEGER NOT NULL REFERENCES member_chat_messages(seq),
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 300),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(reporter_id,message_seq)
);
