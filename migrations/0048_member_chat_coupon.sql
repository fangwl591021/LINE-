-- Add a reference to the existing exchange coupon. No copied coupon or points data.
ALTER TABLE member_chat_messages ADD COLUMN coupon_handle TEXT NOT NULL DEFAULT '';
