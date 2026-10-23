CREATE TABLE IF NOT EXISTS reward_application_previews (
 owner_uid TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE,
 snapshot_json TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reward_applications (
 id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL,
 unit_name TEXT NOT NULL, applicant_name TEXT NOT NULL,
 snapshot_json TEXT NOT NULL, request_json TEXT NOT NULL,
 content_sha256 TEXT NOT NULL, signed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reward_applications_owner ON reward_applications(owner_uid,id);
CREATE TABLE IF NOT EXISTS reward_application_reviews (
 application_id TEXT PRIMARY KEY REFERENCES reward_applications(id),
 reviewer_uid TEXT NOT NULL, decision TEXT NOT NULL CHECK(decision IN ('accepted','rejected')),
 note TEXT NOT NULL, reviewed_at TEXT NOT NULL
);
