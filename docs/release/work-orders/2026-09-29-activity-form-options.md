# Single activity form with date options

Base: d35c372. User authorizes keeping the corrected 商機雙週會 form and deleting incorrectly split duplicates; direct deploy remains authorized.

Allowed: activity option storage, series registration/history/NFC/reminder compatibility, admin listing, exact scoped conversion after backup. Preserve root ID, six dates, existing registration IDs and short link attribution. Ordinary editing must not reassign the activity network.

Forbidden: unrelated activity deletion, member/points/auth changes, real test messages or registrations, unrelated migrations and config changes.

Release: guard before/after; SQLite create/retry/capacity/cancel/history/legacy/conversion tests; mobile/admin browser fixture; Worker dry-run. Apply only migration 0052, deploy with keep-vars. Back up and assert the seven exact rows before converting the six children into options and deleting them; compare outside-scope data and verify root short link/form after release.

Checks: full guard before and after passed; 49 focused tests passed; admin and public-entry browser fixtures passed at 320/390/1440 px with zero production writes. Wrangler 4.142.0 dry-run passed; all existing D1/KV/R2 bindings preserved. Latest D1 definitions reviewed (workers-types 5.20260928.1).

Production inventory confirmed one parent, six children with inconsistent network, three registrations. Pre-schema private backup saved outside Git at `line-activity-form-20260929/backup-1790641190331.json`, SHA256 `87855dafa78e655c9eaa7ffef20a792202403eab56f4a24090ca3847032fe730`. Never publish the backup or generated conversion SQL containing registration snapshots.
