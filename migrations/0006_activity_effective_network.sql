-- Re-scope existing activities by the creator's effective network.

UPDATE activities
SET network_id = COALESCE(
  (
    SELECT CASE
      WHEN LOWER(COALESCE(users.role, '')) IN ('store','tenant') OR users.role IN ('店長','租戶') THEN users.line_id
      WHEN NULLIF(users.network_id, '') IS NOT NULL AND users.network_id <> 'admin' THEN users.network_id
      WHEN NULLIF(users.referrer_id, '') IS NOT NULL THEN users.referrer_id
      ELSE 'admin'
    END
    FROM users
    WHERE users.line_id = activities.creator_id
       OR users.row_id = activities.creator_id
    LIMIT 1
  ),
  'admin'
)
WHERE network_id = '' OR network_id = 'admin';
