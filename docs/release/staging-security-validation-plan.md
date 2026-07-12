# Staging Security Validation Plan

This document is a release plan only. It does not authorize deployment or remote migration.

1. Run all local Phase 3A contracts and the isolated local D1 rebuild.
2. In a separately approved staging change, apply production migrations through `0014` only.
3. Configure the bootstrap secret through the platform secret mechanism; do not commit it.
4. Bootstrap a verified LINE actor, grant and revoke a second platform admin, and retain the role audit evidence.
5. Re-run the security suite against the staging build.

Rollback is a reviewed commit rollback. Schema evidence tables are additive. Phase 3A must not deploy, run remote migrations, or merge to main.