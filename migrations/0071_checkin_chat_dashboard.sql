-- Display templates and immutable sent-message snapshots only. No point/member mutations.
CREATE TABLE IF NOT EXISTS checkin_chat_dashboard_templates (
  template_key TEXT PRIMARY KEY CHECK(template_key='member_checkin'),
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version=1),
  draft_revision INTEGER NOT NULL DEFAULT 0 CHECK(draft_revision>=0),
  draft_json TEXT NOT NULL,
  published_revision INTEGER NOT NULL DEFAULT 0 CHECK(published_revision>=0),
  published_json TEXT NOT NULL,
  updated_at TEXT,
  updated_by TEXT,
  published_at TEXT,
  published_by TEXT,
  last_request_key TEXT,
  last_request_hash TEXT,
  last_request_action TEXT CHECK(last_request_action IN ('draft','publish')),
  last_request_actor TEXT
);
INSERT OR IGNORE INTO checkin_chat_dashboard_templates(template_key,draft_json,published_json)
VALUES('member_checkin',
'{"schemaVersion":1,"altText":"會員購物金・前往商城","themeColor":"#078655","pages":[{"id":"wallet","kind":"wallet","title":"會員購物金","body":"把購物金用在喜歡的商品，逛逛可折抵的好店。","heroImageUrl":"","buttons":[{"id":"shop","label":"前往商城","target":"mall"},{"id":"history","label":"查看購物金明細","target":"details"}]},{"id":"guide","kind":"info","title":"購物金怎麼用","body":"1. 前往商城，選擇喜歡的商品。\n2. 查看商品可折抵規則與購買方式。\n3. 確認結帳內容，依頁面指引完成購買。\n實際折抵金額以商品與結帳確認為準。","heroImageUrl":"","buttons":[{"id":"browse","label":"探索商城好物","target":"mall"},{"id":"detail","label":"查看購物金明細","target":"details"}]}]}',
'{"schemaVersion":1,"altText":"會員購物金・前往商城","themeColor":"#078655","pages":[{"id":"wallet","kind":"wallet","title":"會員購物金","body":"把購物金用在喜歡的商品，逛逛可折抵的好店。","heroImageUrl":"","buttons":[{"id":"shop","label":"前往商城","target":"mall"},{"id":"history","label":"查看購物金明細","target":"details"}]},{"id":"guide","kind":"info","title":"購物金怎麼用","body":"1. 前往商城，選擇喜歡的商品。\n2. 查看商品可折抵規則與購買方式。\n3. 確認結帳內容，依頁面指引完成購買。\n實際折抵金額以商品與結帳確認為準。","heroImageUrl":"","buttons":[{"id":"browse","label":"探索商城好物","target":"mall"},{"id":"detail","label":"查看購物金明細","target":"details"}]}]}');
CREATE TABLE IF NOT EXISTS checkin_chat_dashboard_snapshots (
  card_id TEXT PRIMARY KEY REFERENCES checkin_mall_cards(id),
  template_revision INTEGER NOT NULL CHECK(template_revision>=0),
  config_json TEXT NOT NULL,
  message_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
