# CRM card editing revision repair

- Date: 2026-10-21. User cannot save a card description in CRM.
- Base: 602fef558138dcb19770ca9cfab65fb8d25b3626.
- Scope: admin.html, admin-v2.html, shared CRM editor helper, focused tests and guard registration.
- Cause: CRM rebuilds custom config without the loaded revision and edits legacy fields instead of the active v2 projection.
- Preserve: server revision and atomic CAS checks, ownership/claimed-card restrictions, identity, points, LINE ownership, all unrelated card version/image/video settings.
- Contracts read: core-invariants, card-resolvers, card-ownership-and-versioning, button-actions; feature-change-protocol and work-order template.
- Before: full change guard PASS (line-crm-revision-before.log).
- Implementation: snapshot the loaded config and feature mode, project active fields, submit original revision, validate feature mode again, keep failed drafts; cache authoritative save response before list refresh.
- Tests: both CRM entry points; current and stale revision; repeated saves; legacy/v2 isolation; feature rollback/failure; failure draft preservation; unrelated settings retained.
- After: full change guard PASS (line-crm-revision-after.log); 34 targeted tests PASS; both CRM entry points passed isolated Chromium save/reopen/conflict/draft checks. Browser fixture excludes unrelated external iframes; no real account data written.
- Deployment: Pages only after tests/CI pass. No production card mutations for testing. Rollback: revert this frontend commit.
