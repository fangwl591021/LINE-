# Business Richman people exploration v1

﻿# 單次變更工作單模板

用途：每次修改功能前，先複製本模板到任務紀錄、PR 說明或 issue。
原則：先確認規格與風險，再改程式；改完後必跑 regression。

## 1. Change summary

| Item | Value |
| --- | --- |
| Date | 2026-08-24 |
| Request source | User request in Codex task |
| Target | Business Richman people exploration v1 |
| Start commit | 9730d9e |
| Files | index.html; js/navigation.js; js/modules/business-richman.js; focused tests and version contracts |
| Production deploy | Yes - GitHub Pages only |
| Rollback commit | 9730d9e |

## 2. Allowed scope

- Add one home entry for Business Richman.
- Add an isolated people-exploration board module.
- Read only the authenticated member's collected-card list.
- Reuse the existing card-detail opener.
- Add focused contracts and cache-bust acceptance for navigation 8.02.

## 3. Forbidden scope

- No Worker runtime changes or Worker deployment.
- No D1 migration or production data creation.
- No UID, card ownership, scannedBy, referral, or network changes.
- No public matching pool, AI call, points, coupon, or reward changes.
- No secret or environment-variable changes.

## 4. Affected flows

- [x] Home entry and navigation.
- [x] Read-only collected-card list.
- [x] Existing card-detail open and return flow.
- [ ] Own-card ownership or editing.
- [ ] Public pool or AI matchmaking.
- [ ] Points, coupons, inbox, OCR, LINE OA keyword, or Worker routes.

## 5. Guard before

Command: `npm run guard:before`

Result: PASS. This command was run after the implementation because the repository protocol was discovered late. It is recorded honestly and is not claimed as a true pre-edit baseline. A complete smoke suite also passed before deployment preparation.

## 6. Specifications reviewed

- [x] `docs/rules/core-invariants.md`
- [x] `docs/flows/my-card.md`
- [x] `docs/deployment-runbook.md`
- [x] `docs/release/feature-change-protocol.md`

## 7. Invariants

- [x] Collected cards remain contact assets, never the member's own card.
- [x] No card owner, scanner, referrer, network, or UID data is written.
- [x] Only `getCardHarvestContacts` through the existing loader is used.
- [x] No AI matchmaking or public-pool call is made.
- [x] No points, coupon, reward, or ledger behavior is introduced.

## 8. Implementation record

- `index.html`: entry, page host, cache-busted module and navigation references.
- `js/navigation.js`: initializes the isolated game page.
- `js/modules/business-richman.js`: board, random order, die, movement, session state, arrival preview, and card opening.
- `test/business-richman.test.mjs`: focused contract.
- Version contracts accept the required `navigation.js?v=8.02` cache bust.

Key decision: deploy frontend only. The Worker and production data are unchanged.

## 9. Guard after

Command: `npm run guard:after`

Result: PASS

## 10. Verification

| Test | Result | Note |
| --- | --- | --- |
| Module syntax | PASS | `node --check` |
| Focused Business Richman contract | PASS | no AI call; collected-card source only |
| Full smoke contracts | PASS | all listed project contracts |
| Live static artifact | PENDING | verify after GitHub Pages deploy |
| Authenticated LIFF interaction | PENDING | requires live member session |

## 11. Release decision

- [x] Diff is limited to the declared frontend scope and contracts.
- [x] Worker, D1, secrets, points, and public-pool logic are unchanged.
- [x] Rollback commit is known.
- [x] GitHub Pages cache-bust versions are explicit.
- [x] Guard after passed.
- [ ] Live static artifact verified.

Decision: deploy GitHub Pages after guard-after PASS; do not deploy Worker.