CREATE TABLE IF NOT EXISTS line_oa_threads (
  thread_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'user',
  display_name TEXT NOT NULL DEFAULT '',
  picture_url TEXT NOT NULL DEFAULT '',
  last_message_text TEXT NOT NULL DEFAULT '',
  last_message_type TEXT NOT NULL DEFAULT '',
  last_event_type TEXT NOT NULL DEFAULT '',
  message_count INTEGER NOT NULL DEFAULT 0,
  unread_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  tags TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  last_event_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS line_oa_messages (
  message_id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL DEFAULT '',
  user_id TEXT NOT NULL DEFAULT '',
  direction TEXT NOT NULL DEFAULT 'inbound',
  message_type TEXT NOT NULL DEFAULT '',
  text_content TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT '',
  reply_token TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_line_oa_threads_updated ON line_oa_threads(updated_at);
CREATE INDEX IF NOT EXISTS idx_line_oa_threads_user ON line_oa_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_line_oa_messages_thread ON line_oa_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_line_oa_messages_user ON line_oa_messages(user_id, created_at);
