# Staging Rollback Plan

## Preconditions

Before migration, retain outside Git:

- D1 backup/export reference.
- Masked schema snapshot.
- Row counts for users, card contacts, point ledger, cashier sessions, cashier transactions, point sync jobs, and platform admin roles.
- Migration ledger snapshot.

Do not commit real member data, complete UIDs, tokens, or secrets.

## Rollback Rules

1. Roll back Worker code by reviewed commit, not by editing the live Worker.
2. Migrations `0013` and `0014` are additive. Do not drop their tables as a rollback shortcut.
3. Confirm the older Worker ignores the new tables before code rollback.
4. Disable a bootstrap admin by revoking its role through the audited staging admin action; do not alter rows manually.
5. Pause reconciliation jobs before investigating pending cashier transactions.
6. Treat `pending_verification` and `completed_reconcile_pending` as evidence states; do not replay them until the point authority is confirmed.
7. Switch the staging webhook back only to the approved staging endpoint. Never redirect staging traffic to production.

## Verification After Rollback

- Health route responds from the intended staging Worker.
- Migration ledger remains intact.
- Platform admin audit rows remain readable.
- No staging webhook targets a production endpoint.
- No pending cashier transaction is replayed automatically.
- Counts are compared with the pre-migration evidence.