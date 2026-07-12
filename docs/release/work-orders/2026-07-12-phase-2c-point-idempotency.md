# Phase 2C point idempotency and cashier session protection

日期：2026-07-12
起始 commit：477b23d03ccfe7344e34f2e502fe3c57425019ef
分支：security/phase-2c-point-idempotency
部署：否

## 1. 變更摘要

本次只處理點數交易一致性：店家點數收銀 idempotency、cashier session 單次使用、點數同步 event key 去重、migration、contract 與文件。不得碰 UI、名片、影音、CRM、LINE keyword、Rich Menu、hard admin、Cloudflare bindings 或部署。

## 2. 本次只允許改什麼

- `workerbackup.js` 內店家點數收銀交易保護。
- `PointSyncModule` sync queue event key 去重。
- Phase 2C migration。
- Phase 2C security contract。
- Phase 2C 文件與既有點數契約補充。

## 3. 本次禁止碰什麼

- 不修改 UI、cache bust、名片、影音名片、LINE keyword、Rich Menu。
- 不修改 CRM 權限或 card ownership。
- 不移除 hard admin。
- 不改 Cloudflare bindings。
- 不部署。

## 4. 修改前必跑結果

`npm.cmd run guard:before`：FAIL，既有 baseline failure。

既有失敗摘要：

- `tools/check-auth-contract.js`：D1 fallback accepts `pointUserId` / `pt_uid`、cache-bust versions。
- LINE OA keyword / my-card / cardcool / referral contract 既有順序或 raw 檢查失敗。
- 這些失敗在 Phase 2C 修改前已存在，未作為本次變更範圍修復。

`npm.cmd run smoke`：FAIL，既有 baseline failure。

`node tools/check-auth-contract.js`：FAIL，既有 baseline failure。

## 5. 必讀規格

- `docs/contracts/store-point-cashier-protected-flow.md`
- `docs/contracts/points-ledger.md`
- `docs/rules/core-invariants.md`
- `docs/security/security-audit-phase-1.md`
- `docs/security/action-authorization-policy.md`
- `docs/security/trusted-identity-and-tenant-boundary.md`
- `docs/tests/regression-matrix.md`
- `docs/release/feature-change-protocol.md`

## 6. 實作紀錄

實際修改檔案：

- `workerbackup.js`
- `migrations/0013_point_transaction_idempotency.sql`
- `tools/check-security-phase-2c-contract.js`
- `docs/security/point-transaction-idempotency.md`
- `docs/security/security-audit-phase-1.md`
- `docs/contracts/store-point-cashier-protected-flow.md`
- `docs/contracts/points-ledger.md`
- `docs/tests/regression-matrix.md`
- `docs/README.md`
- `docs/release/work-orders/2026-07-12-phase-2c-point-idempotency.md`

關鍵決策：

- 交易先 reserve，再做點數異動。
- Legacy 前端未傳 explicit idempotency key 時，以 `cashier:{cashierSessionId}` 作為後端 key。
- Cashier session 以 D1 conditional update 從 `prepared` 轉 `processing`，同 session 不可重用。
- 成功 response 格式不變；同 key 成功 retry 回放原 response。
- 母站狀態不明進 `pending_verification`，不可重送造成二次扣點。
- 母站成功但本地 log/sync 失敗進 `completed_reconcile_pending`。
- 本地 fallback sync queue 使用 `point_sync_event_keys.event_key` 去重。

## 7. 修改後必跑

已執行：

- `node --check workerbackup.js`：PASS
- `node --check tools/check-security-phase-1-contract.js`：PASS
- `node --check tools/check-security-phase-2a-contract.js`：PASS
- `node --check tools/check-security-phase-2b-contract.js`：PASS
- `node --check tools/check-security-phase-2c-contract.js`：PASS
- `node tools/check-security-phase-2c-contract.js`：PASS
- `node tools/check-security-phase-2a-contract.js`：PASS
- `node tools/check-security-phase-2b-contract.js`：PASS
- `npx.cmd wrangler d1 migrations list ACTMASTER_DB --local`：PASS，已列出 `0013_point_transaction_idempotency.sql`
- `npm.cmd run smoke`：FAIL，既有 baseline failure，非 Phase 2C 新增
- `npm.cmd run smoke:full`：FAIL，既有 baseline failure，非 Phase 2C 新增
- `npm.cmd run guard:after`：FAIL，既有 baseline failure，非 Phase 2C 新增
- `git diff --check`：PASS，僅 Windows CRLF warning

未執行：

- `wrangler d1 migrations apply`：未執行；`apply` 無 dry-run，且本階段不得直接套遠端 migration。

## 8. 人工驗證重點

| 測試項目 | 預期結果 |
| --- | --- |
| 重送同一 cashier request | 回放第一筆結果，不重複扣點 |
| 同 session 換 key | 拒絕，不進第二次 processing |
| 母站 timeout | pending verification |
| 母站成功但 local log 失敗 | completed_reconcile_pending |
| local fallback sync 重送 | event key 去重 |

## 9. 上線判斷

本工作單不部署。若後續要上線，需先套 migration，並重新確認既有 guard baseline 是否已處理或由使用者明確接受。
