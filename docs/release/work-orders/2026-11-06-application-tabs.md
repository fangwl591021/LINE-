# Cooperation application tabs stability

Scope: keep selected kind, navigation and dialog position stable while loading CRM/member application lists. Preserve targeted CRM filter and signing/review authorization. No Worker, database, ledger or notification changes.

Contract: docs/contracts/reward-applications.md. Before guard passed (private ../tabs-before.log).

Files: application frontend, scoped CSS, cache entry parameters, browser regression and contract.
Validation: slow lists, empty lists, failures/retry, all four kinds, target filter, close/account changes, mobile and desktop. After guard and deployment readback pending.

Results: before/after full contract guards passed; hand-sign UI tests 5/5. Browser regression reproduces old version failure (tabs disappear during read), revised version passes admin/member at 320/390/1280 with long/empty lists, failed read/retry, exact CRM target and account-switch invalidation. All requests synthetic GET; zero production writes. Evidence outside repository ../application-tabs-qa. Worker baseline 67608f0f-4a11-4588-bcf2-ba6d852d3a89; frontend-only release.
