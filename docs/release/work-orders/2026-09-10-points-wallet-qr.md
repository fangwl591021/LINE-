# Compact wallet and member QR

- Request: reduce the balance panel and display the signed-in member's points QR.
- Base: 39645c5dc2e37cd6976bf2a4881b31270791373b; frontend only, no deployment.
- Allowed: index.html, js/auth.js display hook, new wallet QR UI/CSS/local vendor and tests.
- Forbidden: identity resolution, ledger, check-in, cashier lookup/session/transaction, Worker.
- Read: core-invariants, points-ledger, store-point-cashier-protected-flow, feature-change-protocol.
- Before: node tools/run-change-guard.js before PASS.
- QR contract: use successful wallet queriedLineUserId, never invitation URL or access token; clear while loading/error; discard outdated async result; generate locally and load generator only on demand. Display is identification, not payment authorization.
- After: node tools/run-change-guard.js after PASS; syntax and git diff --check PASS.
- Browser: local isolated Chrome at 320/390/768px PASS; real QR encode/decode through jsQR and unchanged cashier parser, modal open/close, stale generation, account-cache mismatch, invalid UID and long negative balance. No production transaction performed.
- Additional files: tools/check-main-liff-endpoint-contract.js updates its pinned auth asset version; test/browser/points-wallet-qr.js adds repeatable local browser assertions.
- Result: local only; not committed, pushed or deployed. QR identifies a member; it is not a mother-site expiring payment authorization token.
