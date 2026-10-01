# Keep activity scope after member confirmation

- Request: fix and deploy the cross-store activity signup rejection.
- Base: cbd1bf85307a85c896d468b064e2299ac592d356.
- Scope: `joinPublicActivity` explicitly sends the loaded activity's network through the existing resolver. Bump home module cache version to 8.18.
- Unchanged: member session, identity, referral, points, backend permissions, activity records and existing registrations. No migration, production data repair, Worker deployment or automatic retry/signup.
- Read: core-invariants.md and liff-routes.md; activity scope must not overwrite member identity or referral.
- Baseline: full guard:before passed. New regression test reproduced the old bug for store, tenant, user and admin before the fix.
- Verification: actual member-session refresh, member confirmation, API serialization and signup functions run in the frontend fixture for single/multi-date forms and all supported network aliases. SQLite backend test retains the wrong-scope denial and permits explicit event-scope signup with unchanged member data.
- Release: run focused tests and full guard:after, merge reviewed diff, deploy through existing GitHub Pages workflow, compare live index/home hashes. Do not redeploy unchanged Worker.
- Rollback: revert this commit and redeploy Pages. No data restoration required.
