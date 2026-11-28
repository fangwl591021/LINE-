-- Both publishing paths share two unfinished events per verified storefront owner.
-- Official activities store local Taipei timestamps. ISO timestamps with offsets are already absolute.
CREATE VIEW IF NOT EXISTS official_activity_end AS
SELECT a.*,
  CASE WHEN substr(COALESCE(NULLIF(a.end_time,''),a.start_time),-1)='Z'
     OR substr(COALESCE(NULLIF(a.end_time,''),a.start_time),20) GLOB '*[+-]*'
  THEN julianday(COALESCE(NULLIF(a.end_time,''),a.start_time))
  ELSE julianday(COALESCE(NULLIF(a.end_time,''),a.start_time),'-8 hours') END AS ends_utc
FROM activities a;

CREATE VIEW IF NOT EXISTS official_activity_host_slots AS
SELECT a.activity_id, a.creator_id,
  COALESCE(NULLIF(a.series_id,''),a.activity_id) AS root_id
FROM official_activity_end a
WHERE a.status='上架' AND a.ends_utc>julianday('now')
 AND NOT EXISTS (SELECT 1 FROM activities p WHERE p.activity_id=a.series_id AND p.status<>'上架');

-- Bridge only the existing explicitly linked LINE identity. Point identities are not owners.
CREATE VIEW IF NOT EXISTS activity_host_identities AS
SELECT u.row_id AS owner_id,u.line_id AS creator_id
FROM users u WHERE COALESCE(u.line_id,'')<>''
 AND NOT EXISTS (SELECT 1 FROM user_identity_links l JOIN users newer ON newer.line_id=l.new_line_id
  WHERE l.status='active' AND l.old_line_id=u.line_id AND newer.row_id<>u.row_id)
UNION
SELECT u.row_id,l.old_line_id
FROM users u JOIN user_identity_links l ON l.new_line_id=u.line_id AND l.status='active'
WHERE l.old_line_id<>l.new_line_id
 AND length(l.old_line_id)=33 AND substr(l.old_line_id,1,1)='U' AND substr(l.old_line_id,2) NOT GLOB '*[^0-9a-fA-F]*'
 AND length(l.new_line_id)=33 AND substr(l.new_line_id,1,1)='U' AND substr(l.new_line_id,2) NOT GLOB '*[^0-9a-fA-F]*'
 AND NOT EXISTS(SELECT 1 FROM users same WHERE same.line_id IN(l.old_line_id,l.new_line_id) GROUP BY same.line_id HAVING COUNT(*)>1)
 AND (SELECT COUNT(*) FROM user_identity_links other WHERE other.status='active'
  AND (other.old_line_id IN (l.old_line_id,l.new_line_id) OR other.new_line_id IN (l.old_line_id,l.new_line_id)))=1;

DROP VIEW IF EXISTS member_event_hosting_quota;
CREATE VIEW member_event_hosting_quota AS
SELECT u.row_id AS owner_id,
  CASE WHEN lower(trim(u.role)) IN ('admin','總管') THEN NULL
       WHEN lower(trim(u.role)) IN ('store','店長') THEN 2 ELSE 0 END AS max_active,
  (SELECT count(*) FROM member_hosted_events e WHERE e.owner_id=u.row_id AND e.status='active'
    AND julianday(e.ends_at)>julianday('now'))
  + (SELECT count(DISTINCT a.root_id) FROM official_activity_host_slots a
     JOIN activity_host_identities i ON i.creator_id=a.creator_id WHERE i.owner_id=u.row_id) AS active_count
FROM users u;

-- AFTER INSERT does not block an existing-row upsert/retry. The UPDATE guard handles reactivation.
CREATE TRIGGER IF NOT EXISTS official_activity_shared_quota_insert AFTER INSERT ON activities
WHEN NEW.status='上架'
BEGIN
  SELECT RAISE(ABORT,'hosted_event_active') WHERE EXISTS (
    SELECT 1 FROM activity_host_identities i JOIN member_event_hosting_quota q ON q.owner_id=i.owner_id
    JOIN official_activity_host_slots a ON a.activity_id=NEW.activity_id
    WHERE i.creator_id=NEW.creator_id AND q.max_active IS NOT NULL AND q.active_count>q.max_active
  );
END;

CREATE TRIGGER IF NOT EXISTS official_activity_shared_quota_reopen BEFORE UPDATE OF status,start_time,end_time ON activities
WHEN NEW.status='上架'
 AND NOT EXISTS (SELECT 1 FROM official_activity_host_slots a
  WHERE a.root_id=COALESCE(NULLIF(OLD.series_id,''),OLD.activity_id) AND a.creator_id=OLD.creator_id)
 AND (CASE WHEN substr(COALESCE(NULLIF(NEW.end_time,''),NEW.start_time),-1)='Z'
        OR substr(COALESCE(NULLIF(NEW.end_time,''),NEW.start_time),20) GLOB '*[+-]*'
      THEN julianday(COALESCE(NULLIF(NEW.end_time,''),NEW.start_time))
      ELSE julianday(COALESCE(NULLIF(NEW.end_time,''),NEW.start_time),'-8 hours') END)>julianday('now')
BEGIN
  SELECT RAISE(ABORT,'hosted_event_active') WHERE EXISTS (
    SELECT 1 FROM activity_host_identities i JOIN member_event_hosting_quota q ON q.owner_id=i.owner_id
    WHERE i.creator_id=NEW.creator_id AND q.max_active IS NOT NULL AND q.active_count>=q.max_active
  );
END;
