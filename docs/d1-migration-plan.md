# D1 Migration Plan

目標：D1 成為主資料庫；GAS / Google Sheet 降級成備份與匯出，不再決定登入、權限、名片、活動核銷。

## 第一階段範圍

先搬會影響穩定度的資料：

1. 會員與權限：`users`
2. 名片庫與專屬名片：`cards`
3. 活動與 NFC/QR 核銷：`activities`, `activity_registrations`
4. 租戶年費訂單與獎金流水：`orders`, `bonus_transactions`

Schema 已在：

`migrations/0001_core_schema.sql`

## 建立 / 套用 Schema

遠端正式 D1：

```powershell
$env:CLOUDFLARE_API_TOKEN=$null
npx.cmd wrangler d1 migrations apply actmaster_db --remote
```

本機測試 D1：

```powershell
$env:CLOUDFLARE_API_TOKEN=$null
npx.cmd wrangler d1 migrations apply actmaster_db --local
```

確認表：

```powershell
$env:CLOUDFLARE_API_TOKEN=$null
npx.cmd wrangler d1 execute actmaster_db --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

## 轉移策略

不要一次切掉 GAS。採三段式：

### 1. 回填

從 GAS 讀現有資料，寫入 D1。每筆保留 `raw_json`，舊欄位不會遺失。

會員對應：

- `userId` -> `users.user_id`
- `name` / `姓名` -> `users.name`
- `phone` / `手機` / `手機號碼` -> `users.phone`
- `role` -> `users.role`
- `networkId` / `歸屬網` -> `users.network_id`
- 已綁名片但沒有會員者，也要寫入 `users`，`source='bound_card'`

名片對應：

- `rowId` -> `cards.card_id`
- `LINE ID` / `userId` -> `cards.owner_user_id`
- `建檔者ID` / `creatorId` -> `cards.creator_user_id`
- `姓名` -> `cards.name`
- `公司名稱` -> `cards.company_name`
- `手機號碼` -> `cards.mobile`
- `服務項目` -> `cards.service`
- `名片圖檔` -> `cards.image_url`
- `自訂名片設定` / `電子名片設定` -> `cards.config_json`

### 2. 雙寫

所有寫入先寫 D1，成功後再寫 GAS 備份。

例如：

- `registerUser`
- `updateUserProfile`
- `saveCard`
- `updateCard`
- `joinActivity`
- `toggleCheckin`
- `mlmCreateOrder`
- `mlmMarkOrderPaid`

雙寫期間前台讀取仍可 fallback GAS，避免轉移漏資料。

### 3. 切讀取

核心讀取改成 D1 優先：

- `checkUser`
- `getAllUsers`
- `getCardContacts`
- `getMyActivities`
- `getActivityRegistrants`

GAS 只在 D1 查不到且非敏感操作時作為補救。

## 切換完成標準

符合以下條件後，GAS 才能降級：

- 登入 100% 由 D1 判斷
- 已綁名片一定存在 `users`
- 名片儲存、更新、刪除走 D1
- 活動報名、取消、核銷走 D1
- 訂單與獎金流水走 D1
- 後台可以匯出 D1 到 CSV / Sheet

## 注意事項

- `rowId` 是舊 GAS 概念，D1 內統一叫 `card_id` / `registration_id`。
- 前端可暫時繼續吃 `rowId`，Worker 回傳時做相容轉換。
- `raw_json` 是保險欄位，轉移初期不要刪。
- 權限不要再依賴 Sheet 即時回應。
