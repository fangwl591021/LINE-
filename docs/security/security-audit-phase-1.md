# Security Audit Phase 1

日期：2026-07-11

範圍：`workerbackup.js` 的認證、授權、D1 identity fallback、硬編碼管理員、點數異動與 cashier session。
限制：本階段只做分析文件與 smoke contract，不修改正式功能、不改 UI、不變更既有 API response、不部署。

## 1. 認證與授權入口

### 1.1 Worker HTTP 入口

- `fetch()` 解析 POST body 的 `action` 與 `payload`，交由 `dispatchAction(action, payload, request, env)`。
- `dispatchAction()` 第一行呼叫 `SecurityModule.authorizeAction()`。
- GET 特例：
  - `/api/line-oa-crm` 使用 `authorizeAction('getLineOAChatCrm')`。
  - `/api/line-oa-audience` 使用 `authorizeAction('getLineOAChatAudience')`。
  - `/api/upload-line-oa-asset` 使用 `authorizeAction('uploadLineOAAsset')`。
- LINE webhook 與 scheduled cron 不走一般使用者 action 權限模型，需另列 webhook 權限邊界。

### 1.2 LINE token actor

`SecurityModule.getActor(payload, request, env)`：

- 從 `payload.lineAccessToken` 或 HTTP `Authorization: Bearer ...` 取 token。
- 呼叫 LINE `/v2/profile` 取得 token owner userId。
- 從 D1 `users` 讀 role、network_id、referrer_id、name、phone。
- 回傳 `{ userId, role, networkId, token }`。

風險：

- 若 token 不存在，部分 action 允許進入 D1 identity fallback。
- `verifyLineAuth()` 在沒有 KV binding 時會回傳 true，屬過渡相容風險。

### 1.3 D1 identity fallback actor

`SecurityModule.getActorFromD1Identity(payload, env)` 會從以下欄位擷取身份：

- `authenticatedUserId`
- `authUserId`
- `operatorId`
- `targetUserId`
- `pointUserId`
- `pt_uid`
- `userId`
- `lineId`
- `LINE_user_id`
- `ownerUserId`
- `creatorId`
- `payload.data.*`
- `data['LINE ID']`
- `data['建檔者ID']`

只要 D1 找得到此 identity，就會建立 actor，且 `token: ''`。

風險：

- 這些欄位多數可由前端 payload 提供。
- 若 action 允許 D1 fallback，攻擊者可嘗試以他人 `userId` 建立 actor。
- fallback 本身沒有檢查該 payload 是否來自 LINE token owner。
- fallback 本身沒有做 tenant ownership 驗證；只能依後續 module 內部邏輯補救。

## 2. Action 分級盤點

### 2.1 public

目前未列入 `adminOnly`、`managerOnly`、`ownTokenRequired` 的 action 會直接通過：

```js
if (!adminOnly.has(action) && !managerOnly.has(action) && !ownTokenRequired.has(action)) {
  return { allowed: true, actor: null };
}
```

因此以下 action 目前等同 public 或 legacy public，需要逐一確認：

- `buildFlexMessage`
- `calculateFateTags`
- `checkUser`
- `confirmCardCoolDraft`
- `d1BackfillFromGas`
- `generateCardCopy`
- `getActivities`
- `getAllActivities`
- `getAllUsers`
- `getCardCoolDraft`
- `getCardForClaim`
- `getMyActivities`
- `getMyRegistrations`
- `getMyVideoDraft`
- `getPublicActivities`
- `getPublicCardById`
- `getSocialLikeStats`
- `getStoreSettings`
- `getUserActivities`
- `getUserRegistrations`
- `joinActivity`
- `listAnnouncements`
- `listRichmanCoupons`
- `mlmGetReferralStats`
- `mlmListOrders`
- `mlmPreviewBonusPlan`
- `prepareTenantCardPayment`
- `recognizeCardWithGPT4o`
- `recordShareCardVisit`
- `recordSocialLike`
- `registerUser`
- `repairRecentLineOAFollowPointAwards`
- `resolveMyCardVersion`
- `reviewCardSafety`
- `searchStoreKnowledgeBase`
- `sendCardCoolCardToChat`
- `updateCrmContact`
- `uploadImageToR2`

建議 Phase 2 做法：

- 改成 deny-by-default。
- 明確建立 `publicActions`。
- 每個 public action 必須有理由與欄位白名單。

### 2.2 authenticated user

以下 action 已列入 `ownTokenRequired`，語意上需要登入使用者：

- `updateUserProfile`
- `linkUserIdentity`
- `getSubsiteHome`
- `getMotherRegistrationUrl`
- `ensureMotherLineMember`
- `queryPointBalanceFast`
- `queryUserPoints`
- `dailyPointCheckin`
- `getInboxCount`
- `listInboxItems`
- `listSentInboxItems`
- `getInboxItem`
- `markInboxRead`
- `searchInboxRecipients`
- `sendInboxMessage`
- `redeemInboxCoupon`
- `getWebPushConfig`
- `saveWebPushSubscription`
- `deleteWebPushSubscription`
- `listPersonalTasks`
- `savePersonalTask`
- `completePersonalTask`
- `deletePersonalTask`
- `getPersonalAssistantCore`
- `savePersonalAssistantCore`
- `matchmakeContacts`
- `nfcCheckin`
- `getActivityById`
- `cancelActivityRegistration`
- `cancelRegistration`
- `unregisterActivity`
- `removeActivityRegistration`
- `mlmCreateOrder`
- `createTenantBonusOrder`
- `mlmListBonusTransactions`
- `mlmGetMemberTree`
- `mlmGetOrganizationTree`

注意：部分 action 仍有 legacy skip 或 D1 fallback，不能只看集合名稱就視為安全。

### 2.3 resource owner

以下 action 應屬資源持有人權限：

- `getCardContacts`
- `getCardHarvestContacts`
- `getCrmContacts`
- `saveCard`
- `updateCard`
- `claimCardAndRegister`
- `deleteCard`
- `unlinkCard`

目前狀態：

- 已列入 `ownTokenRequired`。
- `saveCard`、`updateCard`、`getCardContacts`、`getCardHarvestContacts`、`getCrmContacts` 也列入 D1 identity fallback。
- `deleteCard`、`unlinkCard` 在 D1 module 內有 owner / store manager 檢查。
- `saveCard`、`updateCard` 的 fallback 風險較高，因為 actor 可由 payload identity 建立。

### 2.4 tenant staff

目前沒有明確 staff/admin 分層；`SecurityModule.canManage(role)` 將 `admin` 與 `store` 都視為可管理。

歸類為 tenant staff 或 store manager 的 action：

- `getStorePointCustomer`
- `prepareStorePointCashierSession`
- `storeAdjustCustomerPoints`
- `listStorePointCashierLogs`
- `getStoreKnowledgeBase`
- `saveStoreKnowledgeBase`
- `saveStoreSettings`
- `extractLineVoomMedia`
- `getInboxMonitor`
- `bulkAddRegistrants`
- `updateActivity`
- `removeAct`
- `setActivityStatus`
- `duplicateActivity`
- `getActivityRegistrants`
- `confirmPayment`
- `toggleCheckin`

風險：

- tenant ownership 不是在 `authorizeAction()` 統一驗證。
- 多數 action 需依 module 內部使用 `authenticatedNetworkId` 限制資料範圍。

### 2.5 tenant admin

目前程式沒有獨立的 `tenant_admin` role。建議 Phase 2/3 才拆：

- `store`：日常操作，例如收銀、查客戶。
- `tenant_admin`：店家設定、活動管理、知識庫、收件匣監控。
- `platform_admin`：跨租戶與全站管理。

### 2.6 platform admin

`adminOnly` action：

- `updateUserRole`
- `adminSyncBoundCardUser`
- `auditDataConsistency`
- `repairDataConsistency`
- `previewIdentityMigration`
- `confirmIdentityMerge`
- `listDuplicateCardBindings`
- `resolveDuplicateCardBinding`
- `deployRichMenu`
- `getLineOAChatMonitor`
- `getLineOAChatAudience`
- `getLineOAChatCrm`
- `repairLineOAFollowPointOnboarding`
- `repairPointWalletSearchIndex`
- `diagnosePointSync`
- `listPointSyncJobs`
- `enqueuePointSyncJob`
- `processPointSyncJobs`
- `getAdminPointProfile`
- `adminAdjustCustomerPoints`
- `uploadLineOAAsset`
- `sendLineOAChatReply`
- `updateLineOAChatThread`
- `listLineOAKeywordRules`
- `saveLineOAKeywordRule`
- `deleteLineOAKeywordRule`
- `listAdminAnnouncements`
- `saveAnnouncement`
- `deleteAnnouncement`
- `mlmMarkOrderPaid`
- `mlmCancelOrder`
- `mlmRefundOrder`
- `mlmCreateSettlementBatch`
- `mlmLockSettlementBatch`
- `mlmListSettlementBatches`
- `mlmPreviewMonthlySettlement`
- `mlmMarkSettlementPaid`
- `markTenantOrderPaid`
- `cancelTenantBonusOrder`

## 3. D1 identity fallback 盤點

### 3.1 可在沒有 LINE token 時建立 actor 的 action

明確列入 `d1IdentityFallbackActions`：

- `saveCard`
- `updateCard`
- `saveStoreSettings`
- `getStoreKnowledgeBase`
- `saveStoreKnowledgeBase`
- `updateActivity`
- `dailyPointCheckin`
- `extractLineVoomMedia`
- `getLineOAChatMonitor`
- `getLineOAChatAudience`
- `getLineOAChatCrm`
- `uploadLineOAAsset`
- `sendLineOAChatReply`
- `updateLineOAChatThread`
- `adminSyncBoundCardUser`
- `getCrmContacts`
- `listPersonalTasks`
- `getInboxCount`
- `listInboxItems`
- `listSentInboxItems`
- `getInboxItem`

另有特殊 D1 fallback：

- `queryUserPoints`
- `queryPointBalanceFast`
- `getSubsiteHome`
- `getCardContacts`
- `getCardHarvestContacts`
- `listStorePointCashierLogs`

### 3.2 payload userId 是否可能被偽造

是。原因：

- fallback 會讀 `payload.userId`、`payload.targetUserId`、`payload.ownerUserId`、`payload.creatorId` 等前端欄位。
- actor 建立後會寫回 `payload.authenticatedUserId`、`payload.authenticatedRole`、`payload.authenticatedNetworkId`。
- 沒有 token 時無法證明 payload userId 是請求者本人。

### 3.3 tenant ownership 驗證

目前沒有統一在 `authorizeAction()` 做 tenant ownership 驗證。

現況：

- 部分 module 內部有使用 `authenticatedNetworkId` 或 role 檢查。
- `deleteCard`、`unlinkCard` 有明確 owner/store manager 檢查。
- CRM、Inbox、Activity 等需逐 module 追蹤 SQL 條件，Phase 1 不應直接修改。

建議：

- Phase 2 建立 `resourceOwnershipRules`，至少定義：
  - actor owns resource
  - actor network owns resource
  - platform admin
- 不要靠各 module 自行判斷。

## 4. 硬編碼管理員盤點

### 4.1 hardAdminAccounts

目前硬編碼：

- 方萬隆：
  - ids: `Uf729764dbb5b652a5a90a467320bea29`, `U050397a077bef628b317b0bbedeb2187`
  - phone: `0927136847`
  - names: `方萬隆`, `Tonyfang`
- 楊滄棋：
  - ids: `U58eb5c1a747450140ce1335af709ae55`, `Ue9a59cf9b2969ec78b6bfdc2a4cfca08`
  - phone: `0986919171`
  - names: `楊滄棋`

### 4.2 hardAdminIds

同樣硬編碼四組 UID。

### 4.3 管理員判定邏輯

`isHardAdmin()`：

- 若 id match，需要 phone 或 name match 才回 true。
- 若 id 不 match，phone + name match 也會回 true。

`sanitizeRole()`：

- hard admin 直接 admin。
- 非 hard admin 即使 D1 role 是 admin，也會降為 user。

風險：

- phone + name match 可能讓非指定 UID 被判定為 hard admin。
- 管理員名單部署在程式碼中，輪替需要發版。
- 稽核與權限來源不一致：D1 admin role 對非 hard admin 無效。

建議：

- Phase 2 改成 D1 `platform_admins` 或 `admin_identities` 表。
- hard-coded admin 僅作 break-glass，且只允許 UID match，不用 phone/name 提權。

## 5. 點數異動盤點

### 5.1 idempotency key

有 idempotency 的流程：

- LINE OA follow：`AWD_LINE_OA_FOLLOW_${pointUserId}`。
- 每日簽到：`AWD_DAILY_${pointUserId}_${today}`。
- 掃名片建檔：`AWD_CARD_SCAN_${awardUserId}_${cardId}`。
- 社群按讚：`awardType + date + cardId + likerId`。
- 點數同步佇列：可由呼叫方傳 `jobId`，否則隨機產生。

缺口：

- `storeAdjustCustomerPoints` 沒有 request idempotency key。
- `AdminPointModule.adjust` 以隨機 `APL_${Date.now()}_${random}` 寫 ledger，重送會新增第二筆。
- `PointModule.insertUserPoint` 的母站寫入也未看到店家收銀 request-level 去重。

### 5.2 cashier session 是否單次使用

目前：

- `prepareStorePointCashierSession()` 會建立 cashier session。
- `storeAdjustCustomerPoints()` 會讀 `loadStorePointCashierSession()`。
- 未看到送出後消耗、刪除或標記已使用 session。

風險：

- 相同 `cashierSessionId` 重送可能重複扣店家 10 點，也可能重複贈/扣客戶點數。

### 5.3 是否能防止重複扣點

部分流程能，店家收銀主流程不能完整防止：

- 每日簽到、follow、按讚等有 `point_awards` 去重。
- 店家收銀沒有 `requestId/idempotencyKey`、沒有 cashier session consume、ledger 無唯一 request key。

### 5.4 母站與本地錢包不同步時補償

已有補償：

- 本地 wallet fallback。
- `PointSyncModule.enqueue()` 建立 `point_sync_jobs`。
- 每日簽到與本地收銀會排同步 job。

風險：

- `point_sync_jobs` 有 `source/source_ref` index，但沒有唯一約束。
- 同一補償事件若重送，可能排多筆同步。

建議：

- Phase 2 加 `idempotency_key` 欄位與唯一索引。
- cashier submit 使用 `cashierSessionId + clientRequestId`。
- cashier session 成功送出後立刻 consume。
- 本地 ledger、母站送點、sync job 三者共用同一 idempotency key。

## 6. Critical / High / Medium / Low

### Critical

1. **未列入權限集合的 action 預設公開**
   - 影響：任何新增 action 若忘記分類會自動公開。
   - 修補：改 deny-by-default，建立 `publicActions` 白名單。

2. **D1 identity fallback 可用 payload userId 建立 actor**
   - 影響：部分 action 無 token 時可能以他人 UID 建立 actor。
   - 修補：fallback 只允許明確低風險讀取；寫入類 action 必須 token actor 或 webhook source actor。

3. **店家收銀缺 request-level idempotency 且 cashier session 未單次消耗**
   - 影響：重送或網路重試可能重複扣店家點數或重複異動客戶點數。
   - 修補：新增 `clientRequestId/idempotencyKey`，session consume，ledger unique key。

### High

1. **`saveCard` / `updateCard` 在 D1 fallback action 中**
   - 影響：未登入者可能透過 payload identity 進入名片寫入流程。
   - 修補：名片寫入必須使用 LINE token actor；若要保留舊流程，只允許一次性簽名 token。

2. **硬編碼管理員允許 phone + name match**
   - 影響：身份資料被污染時可能誤提權。
   - 修補：hard admin 僅允許 UID match；phone/name 只能作稽核提示。

3. **tenant ownership 沒有統一驗證層**
   - 影響：A 租戶能否存取 B 租戶 CRM 取決於各 module 實作，容易漏。
   - 修補：新增 `resourceOwnershipRules`，在 dispatch 前統一檢查。

4. **點數同步佇列缺唯一事件鍵**
   - 影響：補償任務可能重複排入。
   - 修補：`source + source_ref` 加唯一約束，或引入全域 idempotency table。

### Medium

1. **AI action 未列權限集合**
   - 影響：`recognizeCardWithGPT4o`、`generateCardCopy`、`reviewCardSafety` 等可能只靠 rate limit。
   - 修補：AI action 至少 authenticated user；公開 OCR 需另外設上傳限制。

2. **`updateCrmContact` 未列權限集合**
   - 影響：CRM 寫入可能公開。
   - 修補：至少 tenant staff，並驗證 contact network ownership。

3. **`repairRecentLineOAFollowPointAwards` 未列 adminOnly**
   - 影響：修復/補發類 action 不應公開。
   - 修補：列入 platform admin。

4. **`uploadImageToR2` 未列權限集合**
   - 影響：公開上傳可能造成濫用與儲存成本。
   - 修補：authenticated user，限制大小、類型與用途。

### Low

1. **權限集合分散在函式內**
   - 影響：不易稽核與測試。
   - 修補：Phase 2 抽為單一 action policy map，但不改 response。

2. **legacy skip actions 與 action policy 沒有同一份文件**
   - 影響：安全意圖不清楚。
   - 修補：新增 `docs/security/action-policy.md`。

3. **部分死碼在 daily checkin fallback 後仍存在**
   - 影響：可讀性與後續維護風險。
   - 修補：Phase 2/3 在測試後清理，不屬本階段。

## 7. Phase 2 建議順序

1. 建立 action policy map，但先保持 response 格式不變。
2. 把 default allowed 改為 deny-by-default。
3. 只把真正 public action 放入 `publicActions`。
4. 移除寫入類 action 的 D1 identity fallback。
5. 對 cashier submit 加 idempotency 與 session consume。
6. 把 hard admin 改成 UID-only break-glass。
7. 對 CRM / inbox / activity 建立 tenant ownership contract。

## 8. 本階段新增 smoke contract

新增：

- `tools/check-security-phase-1-contract.js`

用途：

- 靜態檢查 Phase 1 風險是否存在。
- 目前預期會失敗，作為 Phase 2 修補前的安全紅線。
- 未加入 `tools/run-smoke-contracts.js`，避免影響既有發版 guard。
