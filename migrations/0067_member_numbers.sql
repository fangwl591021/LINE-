-- Additive, permanent public identifiers. Never replace LINE/point identity.
ALTER TABLE users ADD COLUMN member_number TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN member_joined_at TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN member_date_source TEXT NOT NULL DEFAULT '';

CREATE TABLE member_number_registry (
  member_number TEXT PRIMARY KEY,
  user_row_id TEXT NOT NULL UNIQUE,
  line_id TEXT NOT NULL,
  issued_day TEXT NOT NULL,
  day_sequence INTEGER NOT NULL CHECK(day_sequence > 0),
  joined_at TEXT NOT NULL DEFAULT '',
  date_source TEXT NOT NULL,
  UNIQUE(issued_day, day_sequence)
);
CREATE INDEX idx_member_number_line ON member_number_registry(line_id);
CREATE INDEX idx_users_member_number ON users(member_number);

-- Existing dates are historical system records, not proof of original LINE follow.
-- Invalid/future dates receive a number but NEVER acquire fabricated seniority.
INSERT INTO member_number_registry
  (member_number,user_row_id,line_id,issued_day,day_sequence,joined_at,date_source)
WITH dated AS (
  SELECT row_id,COALESCE(NULLIF(line_id,''),row_id) AS line_id,
    CASE WHEN datetime(created_at) BETWEEN datetime('2000-01-01') AND datetime('now')
      THEN strftime('%Y-%m-%dT%H:%M:%fZ',created_at) ELSE '' END AS joined_at
  FROM users
), numbered AS (
  SELECT *,COALESCE(strftime('%Y%m%d',NULLIF(joined_at,''),'+8 hours'),strftime('%Y%m%d','now','+8 hours')) AS day,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(strftime('%Y%m%d',NULLIF(joined_at,''),'+8 hours'),strftime('%Y%m%d','now','+8 hours'))
      ORDER BY CASE WHEN joined_at='' THEN 1 ELSE 0 END,joined_at,row_id
    ) AS seq
  FROM dated
)
SELECT day || printf('%03d',seq),row_id,line_id,day,seq,joined_at,
  CASE WHEN joined_at='' THEN 'legacy_unknown' ELSE 'legacy_created_at' END
FROM numbered;

UPDATE users SET
  member_number=(SELECT member_number FROM member_number_registry WHERE user_row_id=users.row_id),
  member_joined_at=(SELECT joined_at FROM member_number_registry WHERE user_row_id=users.row_id),
  member_date_source=(SELECT date_source FROM member_number_registry WHERE user_row_id=users.row_id);

-- All INSERT paths share one SQLite write transaction. No isolate/local counter.
-- A deleted member's number remains reserved; known identity aliases can reuse it.
CREATE TRIGGER users_assign_member_number AFTER INSERT ON users BEGIN
  INSERT INTO member_number_registry
    (member_number,user_row_id,line_id,issued_day,day_sequence,joined_at,date_source)
  SELECT strftime('%Y%m%d','now','+8 hours') || printf('%03d',COALESCE(MAX(day_sequence),0)+1),
    NEW.row_id,COALESCE(NULLIF(NEW.line_id,''),NEW.row_id),strftime('%Y%m%d','now','+8 hours'),
    COALESCE(MAX(day_sequence),0)+1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'joined'
  FROM member_number_registry WHERE issued_day=strftime('%Y%m%d','now','+8 hours')
  HAVING NOT EXISTS (
    SELECT 1 FROM member_number_registry
    WHERE user_row_id=NEW.row_id OR line_id=NEW.line_id
      OR (NULLIF(NEW.legacy_line_id,'') IS NOT NULL AND line_id=NEW.legacy_line_id)
  );
  UPDATE users SET
    member_number=(SELECT member_number FROM member_number_registry
      WHERE user_row_id=NEW.row_id OR line_id=NEW.line_id
        OR (NULLIF(NEW.legacy_line_id,'') IS NOT NULL AND line_id=NEW.legacy_line_id)
      ORDER BY CASE WHEN line_id=NEW.line_id THEN 0 ELSE 1 END,member_number LIMIT 1),
    member_joined_at=(SELECT joined_at FROM member_number_registry
      WHERE user_row_id=NEW.row_id OR line_id=NEW.line_id
        OR (NULLIF(NEW.legacy_line_id,'') IS NOT NULL AND line_id=NEW.legacy_line_id)
      ORDER BY CASE WHEN line_id=NEW.line_id THEN 0 ELSE 1 END,member_number LIMIT 1),
    member_date_source=(SELECT date_source FROM member_number_registry
      WHERE user_row_id=NEW.row_id OR line_id=NEW.line_id
        OR (NULLIF(NEW.legacy_line_id,'') IS NOT NULL AND line_id=NEW.legacy_line_id)
      ORDER BY CASE WHEN line_id=NEW.line_id THEN 0 ELSE 1 END,member_number LIMIT 1)
  WHERE row_id=NEW.row_id;
END;

CREATE TRIGGER member_numbers_no_update BEFORE UPDATE ON member_number_registry
BEGIN SELECT RAISE(ABORT,'Member numbers are permanent'); END;
CREATE TRIGGER member_numbers_no_delete BEFORE DELETE ON member_number_registry
BEGIN SELECT RAISE(ABORT,'Member numbers cannot be recycled'); END;
