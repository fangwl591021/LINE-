-- Preserve previous visibility; publication status remains independent.
ALTER TABLE activities ADD COLUMN visibility TEXT NOT NULL DEFAULT 'network'
  CHECK (visibility IN ('platform', 'network'));
ALTER TABLE member_hosted_events ADD COLUMN visibility TEXT NOT NULL DEFAULT 'platform'
  CHECK (visibility IN ('platform', 'network'));
-- Empty only for old globally visible records; set from verified owner on first scoped edit.
ALTER TABLE member_hosted_events ADD COLUMN network_id TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_activities_visibility_status ON activities(visibility,status,start_time);
CREATE INDEX idx_member_events_visibility_network ON member_hosted_events(visibility,network_id,status,starts_at);
