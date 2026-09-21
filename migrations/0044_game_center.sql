-- Extend existing attempts; preserve all prior members, awards and tank sessions.
ALTER TABLE daily_tank_sessions ADD COLUMN game_id TEXT NOT NULL DEFAULT 'tank_defense';
ALTER TABLE daily_tank_sessions ADD COLUMN nonce TEXT NOT NULL DEFAULT '';
ALTER TABLE daily_tank_sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'started';
ALTER TABLE daily_tank_sessions ADD COLUMN completed_at INTEGER;
ALTER TABLE daily_tank_sessions ADD COLUMN score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_tank_sessions ADD COLUMN result_json TEXT NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_game_sessions_stats ON daily_tank_sessions(tenant_id,member_id,game_id,challenge_date,status);
CREATE TABLE IF NOT EXISTS game_play_events (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, member_id TEXT NOT NULL,
 game_id TEXT NOT NULL DEFAULT '', session_id TEXT NOT NULL DEFAULT '',
 event_type TEXT NOT NULL, event_date TEXT NOT NULL, created_at INTEGER NOT NULL,
 device_type TEXT NOT NULL DEFAULT 'unknown', score INTEGER NOT NULL DEFAULT 0,
 duration_ms INTEGER NOT NULL DEFAULT 0, result TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_game_events_member ON game_play_events(tenant_id,member_id,event_date,session_id,event_type);
INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES ('schema_game_center','0044_game_center',CURRENT_TIMESTAMP);
