-- Personal campaign copy only. Never changes membership or any personal card.
CREATE TABLE IF NOT EXISTS island_video_card_copies (
 owner_uid TEXT PRIMARY KEY CHECK(length(owner_uid)=33),
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 80),
 description TEXT NOT NULL CHECK(length(description) BETWEEN 1 AND 800),
 revision INTEGER NOT NULL CHECK(revision>0),
 write_nonce TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS island_video_card_copy_commands (
 owner_uid TEXT NOT NULL REFERENCES island_video_card_copies(owner_uid),
 request_key TEXT NOT NULL,
 request_json TEXT NOT NULL,
 response_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(owner_uid,request_key)
);
