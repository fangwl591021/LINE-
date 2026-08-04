ALTER TABLE personal_tasks
ADD COLUMN recurrence_type TEXT NOT NULL DEFAULT 'none'
CHECK (recurrence_type IN ('none', 'daily', 'weekly'));

CREATE TABLE IF NOT EXISTS personal_task_occurrences (
  occurrence_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  occurrence_key TEXT NOT NULL,
  scheduled_for TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'done',
  completed_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_personal_task_occurrences_task_key
ON personal_task_occurrences(task_id, occurrence_key);

CREATE INDEX IF NOT EXISTS idx_personal_task_occurrences_user_schedule
ON personal_task_occurrences(user_id, scheduled_for);
