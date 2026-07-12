# Point Transaction Idempotency (Phase 2C)

日期：2026-07-12

本文件定義店家點數收銀的交易一致性、cashier session 單次使用、點數同步佇列去重與補償策略。本階段不改 UI、不改成功 API response、不部署。

## Source of Truth

- 母站 wallet 是主要點數來源。
- 本地 D1 ledger 與 `store_point_cashier_transactions` 是子站的交易追蹤與冪等防線。
- 本地 wallet 僅作為 fallback；fallback 交易必須標記 `source = local` 或等價來源，並透過唯一 sync event 補償，不可後續重複套用。

## Cashier Session Lifecycle

正式 session 寫入 `store_point_cashier_sessions`，並保留既有 KV session 快取以維持速度。

狀態：

- `prepared`：查到客戶後建立，等待店家送出。
- `processing`：送出時以 D1 conditional update 原子取得處理權。
- `completed`：交易成功完成。
- `failed_retryable`：外部狀態不明或可重試失敗。
- `failed_final`：明確不可重試失敗。
- `expired`：超過有效期限。

有效期限維持既有受保護流程的 180 秒，不在 Phase 2C 修改。

## Idempotency Key

`storeAdjustCustomerPoints` 會正規化下列欄位為單一 key：

- `idempotencyKey`
- `requestId`
- `transactionKey`
- `clientRequestId`
- `client_request_id`

Legacy compatibility：若舊前端未傳 key，且有 `cashierSessionId`，內部使用 `cashier:{cashierSessionId}`。沒有 key 且沒有 session 的新交易會拒絕。

同一 `tenant_id + actor_user_id + idempotency_key` 只能保留一筆交易。相同 key 若 customer、amount、operation type 或 requested deduction 不同，回 `IDEMPOTENCY_CONFLICT`。

## Ledger Schema

Phase 2C 新增 migration：

- `migrations/0013_point_transaction_idempotency.sql`

正式交易表：

- `store_point_cashier_transactions`

主要欄位：

- `transaction_id`
- `tenant_id`
- `network_id`
- `idempotency_key`
- `cashier_session_id`
- `actor_user_id`
- `actor_point_user_id`
- `customer_user_id`
- `customer_point_user_id`
- `operation_type`
- `amount`
- `points`
- `before_balance`
- `after_balance`
- `source`
- `source_ref`
- `external_transaction_id`
- `request_fingerprint`
- `response_json`
- `external_result_json`
- `reconciliation_status`
- `status`
- `error_code`
- `error_message`

## Unique Constraints

- `UNIQUE(tenant_id, actor_user_id, idempotency_key)` where key is not empty.
- `UNIQUE(cashier_session_id)` where session id is not empty.
- `point_sync_event_keys.event_key` is primary key.

選擇 `tenant + actor + key` 是為了讓不同租戶或不同店家操作員可使用各自 client request id，同時避免同一操作員 timeout/retry 造成重複扣點。

## Sync Event Key

`PointSyncModule.enqueue()` 會建立穩定 `event_key`：

- 優先使用 `eventKey`、`event_key`、`idempotencyKey`、`transactionId`、`ledgerId`。
- 否則使用 `lineUserId + source + sourceRef + pointType + points`。
- 沒有 `sourceRef` 的 legacy job 會退回 job id，因此只能保證單筆 job 唯一，不能跨重送去重。

重複 event key 回傳既有 job，不新增第二筆邏輯相同 job。

## Mother Site Outcomes

情況 A：母站成功，本地 ledger 成功
交易標記 `completed`。

情況 B：母站成功，本地後續同步失敗
交易標記 `completed_reconcile_pending`，不再呼叫母站重複扣點，後續依 sync event key 補償。

情況 C：母站 timeout 或狀態不明
交易標記 `pending_verification`，同 idempotency key retry 只能回到同一交易，不建立第二筆 ledger，不把餘額當 0。

情況 D：母站明確失敗
交易標記 `failed_final`，不修改 local final balance。

情況 E：本地 fallback
交易以 `source = local` 追蹤，sync queue 使用唯一 event key，避免重複套用。

## Retry Rules

- 相同成功 request replay 第一筆成功 response。
- 相同 key 但不同 request fingerprint 拒絕。
- 同一 cashier session 不可搭配不同 key 再次執行。
- `processing` 或 `pending_verification` 不會直接再次執行點數異動。

## Contract

執行：

```powershell
node tools/check-security-phase-2c-contract.js
```

完整驗證須同時跑 Phase 2A、2B contract 與 smoke baseline。

## 後續項目

- 將前端正式傳入 client request id，不再只依賴 legacy cashier session key。
- 建立人工 reconciliation 後台檢視。
- 將母站 API 若支援查詢外部交易，補入 pending verification 查詢流程。
- 針對舊無 `sourceRef` 的 sync job 增加更明確事件來源。
