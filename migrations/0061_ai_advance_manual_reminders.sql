-- Additive: existing scheduled reminders retain their original deadline behavior.
ALTER TABLE ai_advance_reminders ADD COLUMN manual_requested INTEGER NOT NULL DEFAULT 0 CHECK(manual_requested IN(0,1));
