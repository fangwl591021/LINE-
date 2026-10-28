-- Private template text is provisioned separately from the user's private sources.
-- This schema never publishes terms, grants a role, creates an order or activates a partner.
CREATE TABLE IF NOT EXISTS signing_application_templates (
 kind TEXT PRIMARY KEY CHECK(kind IN ('partner','full')),
 version TEXT NOT NULL, title TEXT NOT NULL, terms_json TEXT NOT NULL,
 source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
 content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
CREATE TABLE IF NOT EXISTS partner_application_previews (
 owner_uid TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE,
 snapshot_json TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS partner_applications (
 id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL,
 unit_name TEXT NOT NULL, applicant_name TEXT NOT NULL,
 snapshot_json TEXT NOT NULL, request_json TEXT NOT NULL,
 content_sha256 TEXT NOT NULL, signed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS partner_applications_owner ON partner_applications(owner_uid,id);
CREATE TABLE IF NOT EXISTS partner_application_reviews (
 application_id TEXT PRIMARY KEY REFERENCES partner_applications(id),
 reviewer_uid TEXT NOT NULL, decision TEXT NOT NULL CHECK(decision IN ('accepted','rejected')),
 note TEXT NOT NULL, reviewed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS full_application_previews (
 owner_uid TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE,
 snapshot_json TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS full_applications (
 id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL,
 unit_name TEXT NOT NULL, applicant_name TEXT NOT NULL,
 snapshot_json TEXT NOT NULL, request_json TEXT NOT NULL,
 content_sha256 TEXT NOT NULL, signed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS full_applications_owner ON full_applications(owner_uid,id);
CREATE TABLE IF NOT EXISTS full_application_reviews (
 application_id TEXT PRIMARY KEY REFERENCES full_applications(id),
 reviewer_uid TEXT NOT NULL, decision TEXT NOT NULL CHECK(decision IN ('accepted','rejected')),
 note TEXT NOT NULL, reviewed_at TEXT NOT NULL
);
