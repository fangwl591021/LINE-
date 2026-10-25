-- One-time migration: the runner MUST execute this whole file in one transaction.
-- D1 keeps foreign_keys enabled. Defer until commit; never rename the referenced parent.
-- Preserve all nine original values AND rowid. Only the recipient/day UNIQUE is removed.
-- Do not blindly reapply: an already-converted or unexpected schema fails this precondition.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE checkin_mall_cards_guard_0073 (
  original_schema INTEGER NOT NULL,
  CONSTRAINT checkin_mall_0073_original_schema_required CHECK(original_schema=1)
);
INSERT INTO checkin_mall_cards_guard_0073(original_schema)
SELECT CASE WHEN
  (SELECT COUNT(*) FROM pragma_table_info('checkin_mall_cards'))=9
  AND EXISTS (
    SELECT 1 FROM pragma_index_list('checkin_mall_cards') i
    WHERE i."unique"=1 AND (
      SELECT group_concat(name,',') FROM (
        SELECT name FROM pragma_index_info(i.name) ORDER BY seqno
      )
    )='recipient_uid,taipei_day'
  )
  THEN 1 ELSE 0 END;
DROP TABLE checkin_mall_cards_guard_0073;

CREATE TABLE checkin_mall_cards_stage_0073 AS
SELECT rowid AS source_rowid,id,event_id,recipient_uid,taipei_day,created_at,state,retry_key,balance,accepted_at
FROM checkin_mall_cards;

DROP TABLE checkin_mall_cards;
CREATE TABLE checkin_mall_cards (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  recipient_uid TEXT NOT NULL,
  taipei_day TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('preparing','sending','accepted','failed','unknown')),
  retry_key TEXT NOT NULL UNIQUE,
  balance INTEGER,
  accepted_at INTEGER
);
INSERT INTO checkin_mall_cards(rowid,id,event_id,recipient_uid,taipei_day,created_at,state,retry_key,balance,accepted_at)
SELECT source_rowid,id,event_id,recipient_uid,taipei_day,created_at,state,retry_key,balance,accepted_at
FROM checkin_mall_cards_stage_0073 ORDER BY source_rowid;
DROP TABLE checkin_mall_cards_stage_0073;

CREATE INDEX checkin_mall_cards_created ON checkin_mall_cards(created_at);
CREATE INDEX checkin_mall_cards_recipient_day ON checkin_mall_cards(recipient_uid,taipei_day);
