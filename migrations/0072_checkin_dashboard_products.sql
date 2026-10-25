-- Frozen, display-only product targets; preserve existing mall/details click rows and uniqueness.
CREATE TABLE IF NOT EXISTS checkin_chat_dashboard_product_snapshots (
  card_id TEXT NOT NULL REFERENCES checkin_chat_dashboard_snapshots(card_id),
  page_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  product_json TEXT,
  available INTEGER NOT NULL CHECK(available IN (0,1)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(card_id,page_id),
  UNIQUE(card_id,product_id),
  CHECK((available=1 AND product_json IS NOT NULL) OR (available=0 AND product_json IS NULL))
);
CREATE TABLE IF NOT EXISTS checkin_mall_product_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  actor_uid TEXT NOT NULL,
  actor_name TEXT NOT NULL DEFAULT '',
  clicked_at INTEGER NOT NULL,
  minute_bucket INTEGER NOT NULL,
  UNIQUE(card_id,page_id,actor_uid,minute_bucket),
  FOREIGN KEY(card_id,page_id) REFERENCES checkin_chat_dashboard_product_snapshots(card_id,page_id)
);
CREATE INDEX IF NOT EXISTS checkin_mall_product_clicks_time ON checkin_mall_product_clicks(clicked_at,id);
