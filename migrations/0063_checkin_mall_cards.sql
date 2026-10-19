-- Independent analytics only. No point ledger, member or mother-site mutations.
CREATE TABLE IF NOT EXISTS checkin_mall_cards (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  recipient_uid TEXT NOT NULL,
  taipei_day TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('preparing','sending','accepted','failed','unknown')),
  retry_key TEXT NOT NULL UNIQUE,
  balance INTEGER,
  accepted_at INTEGER,
  UNIQUE(recipient_uid,taipei_day)
);
CREATE INDEX IF NOT EXISTS checkin_mall_cards_created ON checkin_mall_cards(created_at);
CREATE TABLE IF NOT EXISTS checkin_mall_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT NOT NULL REFERENCES checkin_mall_cards(id),
  actor_uid TEXT NOT NULL,
  actor_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL CHECK(action IN ('mall','details')),
  clicked_at INTEGER NOT NULL,
  minute_bucket INTEGER NOT NULL,
  UNIQUE(card_id,actor_uid,action,minute_bucket)
);
CREATE INDEX IF NOT EXISTS checkin_mall_clicks_time ON checkin_mall_clicks(clicked_at,id);
