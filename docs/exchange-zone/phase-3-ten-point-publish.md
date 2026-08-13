# 交流專區 Phase 3：10 點文字刊登

## 使用規則

- 每次成功刊登扣除 10 點 `gift_money`，內容有效 7 天。
- 先確認遠端母站點數餘額，再扣點；不使用 D1 本地餘額作為扣點依據。
- 標題 2–80 字，內文 10–2000 字，聯絡標籤最多 3 個且必須在後端白名單內。
- 可以選擇附上「自己的公開名片」。後端自行尋找登入者的 `self_profile + public` 名片，前端不傳內部名片 ID。
- 刪除不退點。本階段尚未提供刪除介面。
- 正式上線後，`EXCHANGE_ZONE_ACCESS_MODE` 設為 `open`，所有已驗證會員可看見入口、閱讀公開貼文並刊登內容。

## 點數安全

`publishExchangeZonePost` 要求有效 LINE 登入，並使用前端產生的冪等鍵。D1 的
`exchange_zone_publish_operations` 對 `(author_user_id, idempotency_key)` 設唯一限制；相同請求成功後重送只回傳既有公開 handle，不再次扣點。

流程為：保留操作 → 建立 draft → 查詢母站餘額 → 扣 10 點 → D1 batch 發布。若扣點後 D1 發布失敗，系統立即補回 10 點並標記 `compensated`；補回失敗則標記 `compensation_pending`，禁止同一請求重扣並等待人工對帳。

Cloudflare D1 與外部點數 API 不共用同一個資料庫交易，因此極端情況（例如外部扣點成功後 Worker 立即中止或回應中斷）無法宣稱跨系統完全原子。`charging`／`debit_uncertain` 狀態會阻止重複扣點，並保留後續對帳依據；介面不會誤稱「尚未扣點」。

## 上線順序

1. 正式環境設定 `EXCHANGE_ZONE_ACCESS_MODE = "open"`；若需緊急關閉，可暫時切回 `private`。
2. 套用 `0022_exchange_zone_publish.sql`。
3. 部署 Worker 與前端。
4. 只用私測帳號驗證不足額、成功刊登、重送與退款案例。
5. 驗證完成後，另行決定是否切到 `pilot` 或 `open`。
