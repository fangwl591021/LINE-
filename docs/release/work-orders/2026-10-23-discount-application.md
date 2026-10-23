# 特約折抵店家手簽申請

- User: continue the discount-store application, test then deploy.
- Base: d32a74f1a74835728bf0680e5be590cd78120979; clean isolated clone, origin fangwl591021/LINE-.
- Source: user-provided 點數通-特約折抵店家申請書.docx. Read complete paragraphs and table text. Free application, minimum 10%, ordinary range 10%-50%, special events independently set; no change to existing transaction limits.
- Scope: a second independent application type in the existing member/CRM signing interface; fixed server terms, source fields, explicit discount/public-information confirmations, independent private storage, PDF and review.
- Expected: worker/reward-applications.mjs, new worker/discount-application-definition.mjs, migration0069, signing UI/PDF/entry cache versions, tests/contracts.
- Forbidden: roles, users, identity, referral ownership, point balance/ledger, cashier, public catalog writes, paid contracts, mother site, secrets/bindings/cron. Review is separate from opening permissions/publication.
- Read: feature-change-protocol, work-order template, core-invariants, liff-routes, points-ledger, reward-applications; Workers runtime/PDF/Wrangler skills.
- Before: full guard PASS, TEMP/line-discount-application-before-20261023.log.
- Source helper-partner name is an optional declared contact only; preserve canonical CRM referrer separately, never overwrite it.
- Source SHA-256: C58D0D5F965CE30FBEAC409C5EDC9DCE1FCB145F49448B295DAEE086E0682C52; original file untouched.
- After: full guard PASS, TEMP/line-discount-application-after-20261023.log; 17 focused tests PASS; both types pass actual Workerd/D1 concurrent submission/review tests.
- Browser: reward and discount at 320/390/1280 PASS, including cancellation, lost-response idempotent retry, account switching, PDF download and CRM review. Both two-page PDFs visually inspected using Poppler, no clipping or missing terms/signatures. No production signatures or point writes during tests.
- Worker dry run --keep-vars --strict PASS. Production settings/bindings/account confirmed. Deployment pending CI, additive migration0069 only, Worker and Pages verification. Physical iPhone/Android LINE acceptance is separate.
