-- Only the two approved administrators may keep the admin role.
-- Fang can have legacy/new LIFF UIDs during the identity transition, but must
-- still match Fang's profile data. Yang must match Yang's profile data.
UPDATE users
SET role = 'user'
WHERE role = 'admin'
  AND NOT (
    (
      line_id IN ('REDACTED_PLATFORM_ADMIN_UID_A', 'REDACTED_PLATFORM_ADMIN_UID_B')
      AND (name LIKE '%REDACTED_ADMIN_NAME_A%' OR name LIKE '%REDACTED_ADMIN_NAME_B%' OR phone = 'REDACTED_PHONE_A')
    )
    OR
    (
      line_id IN ('REDACTED_PLATFORM_ADMIN_UID_C', 'REDACTED_PLATFORM_ADMIN_UID_D')
      AND (name LIKE '%REDACTED_ADMIN_NAME_C%' OR phone = 'REDACTED_PHONE_B')
    )
  );
