-- Administrative draft ordering only: no authorization to calculate, settle or pay.
CREATE TABLE bonus_order_sequence_draft_events (
 event_id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>0),
 request_key TEXT NOT NULL UNIQUE, request_json TEXT NOT NULL,
 recorded_by TEXT NOT NULL, recorded_at TEXT NOT NULL,
 UNIQUE(batch_id,version)
);
CREATE INDEX bonus_sequence_batch_version ON bonus_order_sequence_draft_events(batch_id,version DESC);
