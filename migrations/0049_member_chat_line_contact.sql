-- Optional, member-managed add-friend URL; never used as the LINE push recipient.
ALTER TABLE member_chat_preferences ADD COLUMN line_contact_url TEXT NOT NULL DEFAULT '';
