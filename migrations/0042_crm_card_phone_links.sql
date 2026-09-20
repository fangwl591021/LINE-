-- Contact provenance only: NOT personal-card ownership or LINE identity binding.
CREATE TABLE IF NOT EXISTS crm_card_phone_links (
  id TEXT PRIMARY KEY,
  user_row_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  card_row_id TEXT NOT NULL,
  card_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  actor_uid TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_card_phone_links_user ON crm_card_phone_links(user_id, created_at DESC);
