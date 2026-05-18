CREATE TABLE IF NOT EXISTS inbox_items (
  message_id TEXT PRIMARY KEY,
  receiver_user_id TEXT NOT NULL,
  sender_user_id TEXT NOT NULL DEFAULT '',
  sender_card_id TEXT NOT NULL DEFAULT '',
  network_id TEXT NOT NULL DEFAULT 'admin',
  message_type TEXT NOT NULL DEFAULT 'message',
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  sender_snapshot_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'unread',
  read_at TEXT NOT NULL DEFAULT '',
  archived_at TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inbox_receiver_status ON inbox_items(receiver_user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_inbox_receiver_created ON inbox_items(receiver_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_inbox_sender_created ON inbox_items(sender_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_inbox_network_created ON inbox_items(network_id, created_at);
