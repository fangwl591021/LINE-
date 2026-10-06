-- Independent VEO-style task workflow. No changes to cards, points, agenda or existing notifications.
CREATE TABLE IF NOT EXISTS ai_advance_tasks (
 id TEXT PRIMARY KEY, member_id TEXT NOT NULL, contact_card_id TEXT NOT NULL DEFAULT '',
 parent_id TEXT, parent_revision INTEGER, create_key TEXT NOT NULL,
 title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', due_at TEXT NOT NULL,
 priority TEXT NOT NULL CHECK(priority IN ('low','normal','high')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled')),
 revision INTEGER NOT NULL DEFAULT 0, last_key TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(member_id,create_key), UNIQUE(parent_id,parent_revision)
);
CREATE INDEX IF NOT EXISTS ai_advance_owner_due ON ai_advance_tasks(member_id,status,due_at);
CREATE TABLE IF NOT EXISTS ai_advance_events (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES ai_advance_tasks(id),
 member_id TEXT NOT NULL, request_key TEXT NOT NULL, action TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
 UNIQUE(member_id,request_key)
);
CREATE INDEX IF NOT EXISTS ai_advance_task_events ON ai_advance_events(task_id,created_at);
CREATE TABLE IF NOT EXISTS ai_advance_suggestions (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES ai_advance_tasks(id), member_id TEXT NOT NULL,
 revision INTEGER NOT NULL, day TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('running','completed','failed')),
 result_json TEXT, attempts INTEGER NOT NULL DEFAULT 1, lease_until INTEGER NOT NULL,
 created_at TEXT NOT NULL, UNIQUE(task_id,revision)
);
CREATE INDEX IF NOT EXISTS ai_advance_ai_budget ON ai_advance_suggestions(member_id,day);
CREATE TABLE IF NOT EXISTS ai_advance_preferences (
 member_id TEXT PRIMARY KEY, line_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1))
);
CREATE TABLE IF NOT EXISTS ai_advance_reminders (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL, member_id TEXT NOT NULL, line_id TEXT NOT NULL,
 revision INTEGER NOT NULL, due_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
 lease_until INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
 target_url TEXT NOT NULL, UNIQUE(task_id,due_at)
);
