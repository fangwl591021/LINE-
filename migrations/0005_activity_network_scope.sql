-- Scope activities by tenant/store network.

ALTER TABLE activities ADD COLUMN network_id TEXT NOT NULL DEFAULT 'admin';

UPDATE activities
SET network_id = COALESCE(
  (
    SELECT NULLIF(users.network_id, '')
    FROM users
    WHERE users.line_id = activities.creator_id
       OR users.row_id = activities.creator_id
    LIMIT 1
  ),
  'admin'
)
WHERE network_id = '' OR network_id = 'admin';

CREATE INDEX IF NOT EXISTS idx_activities_network_status
  ON activities(network_id, status, start_time);
