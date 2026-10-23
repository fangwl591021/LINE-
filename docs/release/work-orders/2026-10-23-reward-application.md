# Reward unit signed application

- User approved starting with the reward-unit application, not the disputed partner contract.
- Base: main b31da77a4c722d77a9fba1e1b8c033689f4f3a2f (same tree as tested c0934940).
- Scope: authenticated application API, immutable signed snapshot, admin review, mobile signature, PDF export, CRM/member entry points and additive migration.
- Excluded: users/roles/points/identity mutations, public publication, notifications, partner agreements and source document changes.
- Read: feature-change-protocol, work-order template, core-invariants, liff-routes, points-ledger; Workers runtime patterns and PDF skill.
- Before: full guard PASS (TEMP/line-reward-application-before-20261023.log).
- OneDrive patch attempts failed; isolated shared clone used. No permissions changed.
- LINE account verification only; no claim of real-name verification or certified digital signature. Private server snapshot is authoritative; PDF is an export.
- After: full guard PASS. Initial failure was stale cache-version assertions only; updated exact versions together, no relaxed assertions.
- Focused: 8 API/SQLite tests PASS, Workerd actual D1 concurrent submits/reviews PASS, isolated Chromium at 320/390/1280 PASS (including lost-response retry, cancel, account switch, PDF and admin review).
- PDF: generated 2-page A4 synthetic copy, Poppler rendered and both pages visually checked; complete text, signature and evidence summary visible. No production signature or application created for testing.
- Deployment: pending. Preserve existing settings/bindings/secrets/cron, apply only additive 0068. Review never grants points authority. Real iOS/Android LINE acceptance remains separate.
