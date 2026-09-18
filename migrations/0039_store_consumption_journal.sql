-- Consumer journal metadata only. Never alters orders, cashiers, wallets or identities.
CREATE TABLE store_consumption_journal_viewers (
 viewer_uid TEXT PRIMARY KEY,
 cashier_baseline INTEGER NOT NULL, order_baseline INTEGER NOT NULL, event_baseline INTEGER NOT NULL,
 initialized_at TEXT NOT NULL
);
CREATE TABLE store_consumption_journal_reads (
 viewer_uid TEXT NOT NULL, entry_id TEXT NOT NULL, read_version INTEGER NOT NULL,
 read_at TEXT NOT NULL,
 PRIMARY KEY(viewer_uid,entry_id)
);
CREATE TABLE store_consumption_journal_snapshots (
 id TEXT PRIMARY KEY, viewer_uid TEXT NOT NULL, identity_key TEXT NOT NULL,
 cashier_max INTEGER NOT NULL, order_max INTEGER NOT NULL, event_max INTEGER NOT NULL,
 filter_json TEXT NOT NULL CHECK(json_valid(filter_json)), created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX store_consumption_journal_snapshots_viewer ON store_consumption_journal_snapshots(viewer_uid,expires_at);
