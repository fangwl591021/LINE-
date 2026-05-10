# D1 Migration Plan

目標：D1 成為主資料庫；GAS / Google Sheet 降級成備份與匯出，不再決定登入、權限、名片、活動核銷。

## 第一階段範圍

遠端 D1 目前已經存在核心表：

- `users`
- `card_contacts`
- `activities`
- `registrants`
- `points_ledger`
- `store_settings`

所以回填工具會寫入這套既有 schema，不另外建立第二套會員/名片表。

先搬會影響穩定度的資料：

1. 會員與權限：`users`
2. 名片庫與專屬名片：`card_contacts`
3. 活動與 NFC/QR 核銷：`activities`, `registrants`
4. 租戶年費訂單與獎金流水：`orders`, `bonus_transactions`

Schema 已在：

`migrations/0001_core_schema.sql`

這份 migration 只補安全索引、`orders`、`bonus_transactions`、`app_meta`，不會覆蓋既有 `users/card_contacts/activities/registrants`。

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

Worker 已提供回填 action：

`d1BackfillFromGas`

### Dry Run

先確認 GAS 可讀到多少資料，不會寫入 D1：

```powershell
$body = @{
  action = "d1BackfillFromGas"
  payload = @{
    dryRun = $true
    includeRegistrations = $true
  }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "https://line-engine.fangwl591021.workers.dev/" -Method Post -ContentType "application/json" -Body $body
```

### 正式回填

正式寫入前先設定一次 Worker secret：

```powershell
$env:CLOUDFLARE_API_TOKEN=$null
"請換成你自己的長字串" | npx.cmd wrangler secret put MIGRATION_TOKEN --name line-engine
```

正式回填：

```powershell
$token = "剛剛設定的 MIGRATION_TOKEN"
$body = @{
  action = "d1BackfillFromGas"
  payload = @{
    dryRun = $false
    confirm = "BACKFILL_D1"
    migrationToken = $token
    includeRegistrations = $true
  }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "https://line-engine.fangwl591021.workers.dev/" -Method Post -ContentType "application/json" -Body $body
```

回填完成後檢查筆數：

```powershell
$env:CLOUDFLARE_API_TOKEN=$null
npx.cmd wrangler d1 execute actmaster_db --remote --command "SELECT 'users' AS table_name, COUNT(*) AS count FROM users UNION ALL SELECT 'cards', COUNT(*) FROM cards UNION ALL SELECT 'activities', COUNT(*) FROM activities UNION ALL SELECT 'registrations', COUNT(*) FROM activity_registrations;"
```

會員對應：

- `userId` -> `users.line_id`
- `name` / `姓名` -> `users.name`
- `phone` / `手機` / `手機號碼` -> `users.phone`
- `role` -> `users.role`
- `networkId` / `歸屬網` -> `users.network_id`
- 已綁名片但沒有會員者，也要寫入 `users`，`source='bound_card'`

名片對應：

- `rowId` -> `card_contacts.row_id`
- `LINE ID` / `userId` -> `card_contacts.line_id`
- `建檔者ID` / `creatorId` -> `card_contacts.creator_id`
- `姓名` -> `card_contacts.name`
- `公司名稱` -> `card_contacts.company_name`
- `手機號碼` -> `card_contacts.mobile`
- `服務項目` -> `card_contacts.services`
- `名片圖檔` -> `card_contacts.image_url`
- `自訂名片設定` / `電子名片設定` -> `card_contacts.custom_config`

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
