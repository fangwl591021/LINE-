# LINE- entry performance

- Date: 2026-09-05. User requested measured faster entry and background work after entering.
- Baseline: a5f600a, clean and identical to origin/main. User subsequently authorized deployment on 2026-09-05; release through the existing main-branch GitHub Pages workflow.
- Scope: index.html, js/modules/customers.js, js/modules/home.js, the customer import contract, and focused loader/scheduling tests.
- Excluded: Worker, identity/role/claim logic, point ledger, data schemas, LINE authorization and routing.
- Read: core-invariants.md, contracts/liff-routes.md, release/feature-change-protocol.md, change-work-order-template.md, previous login-home-bootstrap-performance work order.
- Before: npm run guard:before PASS.
- Live evidence: isolated Chrome DevTools, mobile viewport 390x844, unthrottled cold loads. Landing LCP 1127ms and 967ms, then LINE Login. Full authenticated entry not measured because isolated browser has no authorized session.
- Change: load the pinned SheetJS parser only when a valid import file is selected; coalesce concurrent loads, allow retry after failure, bound loading time. Existing delayed home tasks yield to browser idle time (with timeout), while priority home aggregate stays immediate.
- All UID, ownership, version, referral, point, share and send invariants preserved.
- After: npm run guard:after PASS after updating the home cache-version assertion in tools/check-ai-match-interest-contract.js; syntax and git diff --check PASS. Five behavioral tests in test/entry-background-loading.test.mjs PASS (deduplication, retry, timeout, idle priority, fallback).
- Browser verification: local mobile-viewport harness pauses LIFF initialization, without authorizing any user. Before: 44 script requests, SheetJS loaded before login (588.7ms request). After: 43 script requests, zero SheetJS requests before selection; selecting a test CSV downloads it once, loads version 0.20.3, and parses one worksheet without saving any data.
- Local LCP before/after: 1047/867ms, DOMContentLoaded 1555.5/1379.8ms. These single local samples include different document serving costs (baseline reads Git), so they are not evidence of a production latency percentage improvement or authenticated entry speed.
- Release decision: publish frontend only after the passing checks. Verify Pages workflow success and the served index/customer/home assets. Full authenticated mobile entry time remains unmeasured.
