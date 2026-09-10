# Shared cashier safety and product QR

- User explicitly approved transaction IDs, duplicate protection, timeout lookup, then product QR redemption using shared points.
- Follow-up explicit authorization: existing cashier reward AND redemption must require transaction IDs and timeout lookup, not only product redemption. Old clients must reload. No deployment authorized.
- Base ce945daa497e9439af22c0bfd5f11e7e3c689a28. Before full guard PASS.
- Read core-invariants, points-ledger, store-point-cashier-protected-flow, store-shop, liff-routes and Workers best practices.
- Scope: isolated D1 journal/migration, cashier dispatch and write boundary, persistent frontend request, product QR/checkout and tests.
- No production writes/deploy, no new wallet, settlement, automatic refunds, identity remapping, or changes to unrelated rewards.
- New transactions re-query authoritative balance; 180-second session creation and lookup remain unchanged. This is an approved safety exception to session reuse for writes.
- At-most-once attempt per actor/request. Pending/sending/unknown locks canonical customer across this cashier. Unknown does not auto-expire or auto-retry. Other point writers are outside this lock.
- Upstream has no verified idempotency/reconciliation API: status lookup reads this journal, never infers success from balance changes. Unknown requires mother ledger reconciliation; no automatic refund/unlock endpoint.
- Migration required before deployment. Old clients without request IDs fail closed with refresh message.
- After validation: full guard PASS, 18 SQLite/catalog/backend tests PASS, 5 frontend request persistence tests PASS, isolated Chrome 320/390px QR decoding and confirmed checkout/status recovery PASS, Wrangler 4.129.0 deploy --dry-run PASS, git diff --check PASS.
- Browser mock drops HTTP response after a confirmed local journal write; status lookup recovers success with no second simulated point write. No production LINE login, mother debit, migration or deployment performed.
- Source: worker/store-cashier-requests.mjs; cashier dispatch/write boundary in workerbackup.js; safe-cashier.js; product checkout/QR and routing assets; migration 0030; focused tests and contracts.
- Release order after separate deployment authorization: verify remote migration list, apply only 0030, deploy Worker from committed exact tree, then publish matching frontend. Verify anonymous authorization rejection and live asset hashes. Reload old cashier pages.
- Operational limit: cashier lock does not serialize unrelated mother/admin point writers. Unknown upstream outcomes require exact transaction marker reconciliation; never infer success/absence from current balance. No automatic refund/unlock is implemented.
- Product checkout currently uses one item and integer NT$ prices; fractional catalog prices fail explicitly rather than rounding. Mother success envelope needs confirmation in an authorized staging/live test before claiming end-to-end production checkout success.
