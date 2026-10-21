# Card phone validation and no FAX buttons

- User: mixed company phone / FAX must not become a dial button; FAX is not a mobile card action.
- Base: f7f263daec1ee63f2fb7cdfd24effb5f8f8f8461.
- Scope: shared card-link parsing/validation, existing frontend and Worker phone-button creation, cache versions, tests/contracts.
- Preserve raw contact/FAX fields for CRM reference; no bulk data rewrite, identity/ownership changes, points or external messages.
- Rule: generate only unambiguous voice numbers; never concatenate text/FAX/multiple numbers into one tel URI. FAX-labelled buttons are hidden at presentation and rejected on explicit save. Existing legitimate voice numbers remain supported.
- Read: feature-change-protocol, work-order template, core-invariants, card-resolvers, card-ownership-and-versioning, button-actions. Workers/wrangler skills used for safe shared-code and release checks.
- Before: full guard PASS (line-phone-no-fax-before.log).
- After: full guard PASS; 57 targeted tests PASS; isolated Chromium for both admin pages passed voice extraction, FAX save rejection, normal save/reopen and stale-conflict draft retention. Initial full guard only failed on an old mycard cache-version assertion; updated to the new version and reran successfully.
- Deployment: Worker + Pages after CI, preserve bindings/secrets/vars/schedules. No production mutation for tests.
- Rollback Worker: 1a29d05c-5150-4cf9-b144-784e8bfd5839. Settings hash 3b36c4b961bcc15b7e3354cbb3fa94d806afdbcbdb427816216b1f196573198d; schedules hash 3daefe8b947c3a195b684f87eabed3802f9e5fe166e6f82b805479be2495d578.
