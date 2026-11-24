-- Limits come from the canonical member row, never from the request body.
CREATE VIEW IF NOT EXISTS member_event_hosting_quota AS
SELECT u.row_id AS owner_id,
  CASE
    WHEN lower(trim(u.role)) IN ('admin', '總管') THEN NULL
    WHEN lower(trim(u.role)) IN ('store', '店長') THEN 2
    ELSE 1
  END AS max_active,
  (SELECT count(*) FROM member_hosted_events e
   WHERE e.owner_id = u.row_id AND e.status = 'active'
     AND julianday(e.ends_at) > julianday('now')) AS active_count
FROM users u;

CREATE TRIGGER IF NOT EXISTS member_hosted_quota_insert BEFORE INSERT ON member_hosted_events
WHEN NEW.status = 'active' AND julianday(NEW.ends_at) > julianday('now')
BEGIN
  SELECT RAISE(ABORT, 'hosted_event_active') WHERE EXISTS (
    SELECT 1 FROM member_event_hosting_quota
    WHERE owner_id = NEW.owner_id AND max_active IS NOT NULL AND active_count >= max_active
  );
END;

-- An editable event already occupies a slot; edits and cancellations need no new slot.
CREATE TRIGGER IF NOT EXISTS member_hosted_edit_guard BEFORE UPDATE ON member_hosted_events
BEGIN
  SELECT RAISE(ABORT,'hosted_event_closed') WHERE OLD.status!='active' OR julianday(OLD.ends_at)<=julianday('now');
  SELECT RAISE(ABORT,'hosted_owner_invalid') WHERE NEW.owner_id!=OLD.owner_id OR NEW.id!=OLD.id OR NEW.create_key!=OLD.create_key;
  SELECT RAISE(ABORT,'hosted_capacity_too_small') WHERE NEW.capacity>0 AND NEW.capacity<(SELECT COUNT(*) FROM member_event_registrations WHERE event_id=OLD.id AND status='registered');
END;

DROP TRIGGER IF EXISTS member_hosted_single_insert;
DROP TRIGGER IF EXISTS member_hosted_update_guard;
