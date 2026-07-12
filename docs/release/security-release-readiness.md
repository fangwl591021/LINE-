# Security Release Readiness

Before any production release: review Phase 2A-2D commits, apply migrations in order through 0014, set `ADMIN_BOOTSTRAP_SECRET` securely, bootstrap one verified LINE identity, verify a second admin can be granted and revoked, and retain a rollback commit. Do not deploy if smoke baselines gain new authorization failures. Migration rollback is additive only; do not drop role/audit tables while evidence is needed.

Known baseline failures remain outside this work: LINE keyword ordering, cache-bust contracts and button action contract.