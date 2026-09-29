# Complete single-form date uniqueness

Base b7839ec / PR 170. Same user authorization; no additional scope.

Production conversion hit existing `idx_registrants_unique_phone` / `idx_registrants_unique_line`, which were missing from the initial fixture inventory. D1 import rolled back fully: parent plus six children and three registrations still present; no partial deletion.

Only allowed change: replace those two indexes atomically with activity + option + member/phone uniqueness. Preserve exact legacy rules for empty batch_id and all existing data. Add actual production indexes to every activity-batch fixture and test duplicate member, duplicate phone, multi-select, cancelled rejoin and conversion. No unrelated data/index changes.

Release only 0053 via isolated config; rerun the original guarded conversion from the private verified backup after comparing current data. No further Worker runtime changes needed. Use current guard before/after and focused tests; do not deploy on failures.
