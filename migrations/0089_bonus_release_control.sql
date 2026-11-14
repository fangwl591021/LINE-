-- Empty control history means disabled. Existing finance and payment tables are untouched.
CREATE TABLE bonus_release_control_events (
 version INTEGER PRIMARY KEY CHECK(version>0),
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 previous_enabled INTEGER NOT NULL CHECK(previous_enabled IN (0,1)),
 actor_uid TEXT NOT NULL, reason TEXT NOT NULL, recorded_at TEXT NOT NULL,
 request_key TEXT NOT NULL UNIQUE, request_json TEXT NOT NULL
);
