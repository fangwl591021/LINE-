# Trusted Identity and Tenant Boundary (Phase 2B)

日期：2026-07-11

本文件記錄 Phase 2B 的修補範圍：可信身份、名片資源所有權、CRM 租戶邊界。此階段不改 UI、不改成功 API response、不改資料庫 schema、不部署。

## 核心原則

1. 操作者 actor 只能來自 LINE token 或伺服端可信 D1 fallback。
2. 前端 payload 的 `userId`、`targetUserId`、`ownerUserId`、`creatorId`、`LINE_user_id`、`pointUserId` 等欄位只能代表目標資源，不可建立 actor。
3. 既有名片更新只能改內容，不可藉由 `updateCard` 偷換 `line_id`、`owner_user_id`、`profile_user_id`、`source_type`、`network_id` 等歸屬欄位。
4. CRM 列表與更新必須依 actor 身份限制：platform admin 可跨租戶；store manager 只能同 `authenticatedNetworkId`；一般會員只能自己的 identity set。
5. 掃描或匯入他人名片時，scanner 是建立者/掃描者，不會因為沒有 target owner 就自動成為該名片 owner。

## 可信 actor 來源

### 正式來源

- `SecurityModule.getActor()` 驗證 LINE access token 後建立 actor。
- actor 包含：`userId`、`role`、`networkId`、`token`。
- `authorizeAction()` 會把 actor 寫回：
  - `payload.authenticatedUserId`
  - `payload.authenticatedRole`
  - `payload.authenticatedNetworkId`

### 受控 D1 fallback

`SecurityModule.getActorFromD1Identity()` 仍保留，但只接受可信來源標記：

- `server_verified`
- `signed_session`
- `line_webhook`
- `internal_worker`

沒有可信標記時，即使 payload 內有 `userId` 或 `targetUserId`，也不會建立 actor。

## 禁止建立 actor 的 payload 欄位

以下欄位在 Phase 2B 後不得用來建立 actor：

- `targetUserId`
- `pointUserId`
- `pt_uid`
- `userId`
- `lineId`
- `LINE_user_id`
- `ownerUserId`
- `creatorId`
- `data.LINE_user_id`
- `data['LINE ID']`
- `data['建檔者ID']`

這些欄位只能在已驗證 actor 後，用於指定目標資料或查詢條件。

## 名片寫入規則

### `saveCard`

- 必須有已驗證 actor。
- 新增 `self_profile` 或 `video_profile` 時，owner/profile/creator 以 actor 為準。
- 新增 `private_import` 時，actor 是 `creator_id` / `scanner_user_id`；若沒有明確 target owner，不自動把 scanner 設成 owner。
- 不使用姓名、電話、公司名稱推斷 owner。

### `updateCard`

- 必須有已驗證 actor。
- 允許條件：
  - actor 的 canonical identity set 命中既有 row 的 `line_id` / `creator_id` / `owner_user_id` / `profile_user_id`；或
  - actor 是 platform admin；或
  - actor 是 store manager 且 `authenticatedNetworkId` 等於既有 row 的 `network_id`。
- 既有 row 更新時保留下列歸屬欄位：
  - `line_id`
  - `creator_id`
  - `owner_user_id`
  - `profile_user_id`
  - `source_type`
  - `visibility`
  - `pool_eligible`
  - `ai_review_status`
  - `network_id`
- 認領、合併、轉移歸屬不可走 `updateCard` 偷換，必須使用專門 action。

## 名片讀取規則

### `getCardContacts`

- admin：可讀全站。
- store：只讀 `network_id = authenticatedNetworkId` 的名片。
- user：只讀自己的 canonical identity set 命中的名片。

### `getCardHarvestContacts`

- 只讀 `scanner_user_id` 或 legacy creator/owner 命中 actor canonical identity set 的 AI 名片夾資料。
- 不含 `self_profile` 與 `referral_placeholder`。

## CRM 租戶邊界

### `getCrmContacts`

- admin：可讀全站 CRM。
- store：只讀 `card_contacts.network_id = authenticatedNetworkId`。
- user：只讀自己的 canonical identity set 命中的 CRM/card rows。

### `updateCrmContact`

- admin：可更新全站 CRM。
- store：只能更新 `row.network_id = authenticatedNetworkId` 的 CRM。
- user：只能更新自己的 resource row。

## D1 fallback 收斂

Phase 2A 時 `allowD1Fallback` 共 27 個。Phase 2B 後剩 12 個：

- `getSubsiteHome`
- `queryPointBalanceFast`
- `queryUserPoints`
- `dailyPointCheckin`
- `listPersonalTasks`
- `getInboxCount`
- `listInboxItems`
- `listSentInboxItems`
- `getInboxItem`
- `getStoreKnowledgeBase`
- `extractLineVoomMedia`
- `listStorePointCashierLogs`

這些 fallback 仍需可信來源標記才會建立 actor；其中點數快速查詢保留既有 resource compatibility branch，後續 Phase 2C 再拆。

## 已移除 fallback 的高風險 action

- `getCardContacts`
- `getCardHarvestContacts`
- `getCrmContacts`
- `saveCard`
- `updateCard`
- `updateActivity`
- `saveStoreSettings`
- `saveStoreKnowledgeBase`
- `adminSyncBoundCardUser`
- `getLineOAChatMonitor`
- `getLineOAChatAudience`
- `getLineOAChatCrm`
- `uploadLineOAAsset`
- `sendLineOAChatReply`
- `updateLineOAChatThread`

## Contract

執行：

```powershell
node tools/check-security-phase-2b-contract.js
```

驗證項目：

- 高風險 action 不允許 D1 fallback。
- `getActorFromD1Identity()` 不信任目標/資源欄位。
- `upsertCard()` actor 只來自 `authenticatedUserId`。
- `upsertCard()` 既有名片更新保留歸屬欄位。
- `upsertCard()` owner 檢查不使用姓名、電話、公司。
- `getCrmContacts()` 與 `updateCrmContact()` 具有租戶邊界。

## Phase 2C 留待處理

- 點數與 cashier request-level idempotency。
- 點數同步唯一鍵。
- `queryUserPoints` / `queryPointBalanceFast` 的 legacy resource fallback 拆分。
- hard admin 移除或改成 UID-only break-glass。
- 更細的 tenant staff / tenant admin role 分層。