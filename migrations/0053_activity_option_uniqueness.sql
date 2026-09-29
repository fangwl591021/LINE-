-- Legacy uniqueness was per activity/member or activity/phone, blocking multi-date forms.
-- Empty batch_id keeps EXACTLY the existing single-event uniqueness (including cancelled rows).
-- Date options allow cancelled rejoin while preventing duplicate active signups for that date.
DROP INDEX IF EXISTS idx_registrants_unique_line;
DROP INDEX IF EXISTS idx_registrants_unique_phone;
CREATE UNIQUE INDEX idx_registrants_unique_line
  ON registrants(activity_id,batch_id,line_id)
  WHERE line_id IS NOT NULL AND line_id != '' AND (batch_id = '' OR status <> 'cancelled');
CREATE UNIQUE INDEX idx_registrants_unique_phone
  ON registrants(activity_id,batch_id,phone)
  WHERE phone IS NOT NULL AND phone != '' AND (batch_id = '' OR status <> 'cancelled');
