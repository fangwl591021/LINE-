# Staging Cashier Idempotency Matrix

Use only isolated `STG_` tenant, actor, customer, and point authority fixtures.

1. Prepare cashier session.
2. First debit succeeds once.
3. Re-send same idempotency key; no second debit.
4. Reuse session with a different key; reject.
5. Reuse key with a different customer; reject.
6. Actor mismatch; reject.
7. Tenant mismatch; reject.
8. Expired session; reject.
9. Two parallel submissions; exactly one succeeds.
10. Simulated upstream timeout; record `pending_verification`.
11. `completed_reconcile_pending` does not call the mother site again.
12. Re-send point sync event key; no second job is created.

The write suite requires `--allow-write --test-data-prefix STG_<name>` and a staging hostname. Phase 3B only prepares this matrix; it does not execute it.