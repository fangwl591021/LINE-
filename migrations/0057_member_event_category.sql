-- Keep existing events, registrations and media references intact.
ALTER TABLE member_hosted_events ADD COLUMN category TEXT NOT NULL DEFAULT '活動'
  CHECK(length(trim(category)) BETWEEN 1 AND 40);
