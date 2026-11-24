-- Restrict new member-hosted activities without changing existing event rows.
DROP VIEW IF EXISTS member_event_hosting_quota;
CREATE VIEW member_event_hosting_quota AS
SELECT u.row_id AS owner_id,
  CASE
    WHEN lower(trim(u.role)) IN ('admin', '總管') THEN NULL
    WHEN lower(trim(u.role)) IN ('store', '店長') THEN 2
    ELSE 0
  END AS max_active,
  (SELECT count(*) FROM member_hosted_events e
   WHERE e.owner_id = u.row_id AND e.status = 'active'
     AND julianday(e.ends_at) > julianday('now')) AS active_count
FROM users u;
