# Activity form dates

- New multi-date publication inserts ONE `activities` row; its `batch_options` JSON contains up to 24 server-validated options. Option IDs are not standalone activity IDs.
- A date registration uses the root `activity_id` and option `batch_id`. Its registration ID, snapshot, fee, payment, cancellation and QR remain per-date. Only verified member identity and server-stored fees/capacities are accepted.
- Retry and cancelled rejoin dedupe by root + option + member. Full/closed dates cannot insert; partial success remains explicit.
- Migration 0053 replaces the actual legacy member/phone unique indexes with activity + option + member/phone keys. Empty option preserves single-event rules exactly; cancelled option registrations can rejoin. Fixtures must contain these production indexes, not just table columns.
- Root list/detail includes `batches` for the existing checkbox UI. Legacy separate rows continue working until an explicitly authorized conversion. Editors cannot reassign existing activity ownership or drop its options by replacing a DM.
- History, NFC and reminders resolve the selected date, not the root min/max span. Ambiguous NFC date requires selection or the per-registration QR.
- The one-off conversion requires an exact saved snapshot, fixed parent/children and verified network. Guard drift, move registration FKs before deleting children, retain root short URLs and all outsiders. Do not repair point references automatically.
- Tests: `test/activity-batches.test.mjs`, `test/activity-registration-history.test.mjs`, `test/admin-activity-registration.test.mjs`, browser `activity-entry.mjs` / `admin-activity-registration.mjs`.
