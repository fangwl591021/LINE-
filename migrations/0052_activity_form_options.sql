-- A series is one activity/form. Dates are options, not separately listed activities.
ALTER TABLE activities ADD COLUMN batch_options TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(batch_options) AND json_type(batch_options) = 'array');
ALTER TABLE registrants ADD COLUMN batch_id TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_registrants_activity_batch_member ON registrants(activity_id,batch_id,line_id,status);
