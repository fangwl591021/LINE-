# Action Authorization Policy

本文件定義 `workerbackup.js` 內 `dispatchAction()` 的集中式授權政策。Phase 2A 的目標是把 action 權限從散落集合收斂成單一來源，並改為 deny-by-default。

## 位置

授權政策位於 `workerbackup.js`：

```js
const ACTION_POLICIES = {
  actionName: {
    access: 'authenticated',
    ownership: 'self',
    tenantScoped: true,
    allowD1Fallback: true,
    legacyAuthSkip: true
  }
};
```

`SecurityModule.authorizeAction()` 只能依 `ACTION_POLICIES` 判斷 action 是否允許，不可再用「未列入集合就放行」的方式。

## Policy 欄位

| 欄位 | 說明 |
| --- | --- |
| `access` | 必填。權限等級：`public`、`authenticated`、`manager`、`admin`。 |
| `ownership` | 資源歸屬提示，例如 `self`、`tenant-resource`、`resource-owner`。Phase 2A 先文件化，深入驗證留到 Phase 2B。 |
| `tenantScoped` | 表示此 action 應受租戶或店家範圍限制。 |
| `allowD1Fallback` | 只有明確為 `true` 時，才允許沒有 LINE token 時使用 D1 identity fallback；Phase 2B 起還必須有可信來源標記。 |
| `legacyAuthSkip` | 過渡期欄位。表示 dispatchAction 的舊 LIFF token 二次驗證可暫時略過。不可拿來推論 public。 |
| `note` | 稽核備註，不參與授權判斷。 |

## 權限等級

| 等級 | 原則 |
| --- | --- |
| `public` | 不需要登入，但必須在 policy 明確標記。 |
| `authenticated` | 必須能建立 actor。可搭配 `ownership` 或 `allowD1Fallback`。 |
| `manager` | 需要 `admin` 或 `store` 角色。通常應搭配 `tenantScoped`。 |
| `admin` | 僅 `admin` 角色可呼叫。修復、部署、角色調整、LINE OA 管理都應使用此等級。 |

## Deny-by-default

規則：

1. `dispatchAction()` 內每一個 `case` 必須存在於 `ACTION_POLICIES`。
2. 只有 `access: 'public'` 的 action 才能免驗證。
3. 未登錄 policy 的 action 一律拒絕，錯誤字串包含 `ACTION_POLICY_NOT_FOUND`。
4. server log 只記錄 action 名稱，不記錄 token、完整 LINE UID 或敏感 payload。
5. 不得恢復舊邏輯：`未列入 admin/manager/self 集合 => allowed: true`。

## Public Action 清單

目前 public action 共 11 個：

- `checkUser`
- `getCardForClaim`
- `getPublicCardById`
- `getPublicActivities`
- `getStoreSettings`
- `listRichmanCoupons`
- `listAnnouncements`
- `registerUser`
- `joinActivity`
- `getSocialLikeStats`
- `recordShareCardVisit`

新增 public action 時，必須在 PR 或變更紀錄說明為何不需要 actor，以及是否會暴露個資、點數、CRM 或管理資料。

## D1 Fallback Action 清單

目前仍允許 D1 identity fallback 的 action 共 12 個：

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

Phase 2B 已將名片寫入、CRM、高風險管理與 LINE OA 管理 action 移出 D1 fallback。仍保留的 fallback 必須有可信來源標記；點數快速查詢的 legacy resource compatibility branch 留到 Phase 2C 拆分。

## 新增 Action 必要步驟

1. 在 `dispatchAction()` 新增 `case`。
2. 同步在 `ACTION_POLICIES` 新增 policy。
3. 若不是 `public`，確認 actor 來源、資源歸屬與租戶範圍。
4. 若需要 D1 fallback，必須明確寫 `allowD1Fallback: true`，並在本文件更新清單。
5. 執行 Phase 2A contract。

## 安全 Contract

執行：

```powershell
node tools/check-security-phase-2a-contract.js
```

完整驗證建議：

```powershell
node --check workerbackup.js
node --check tools/check-security-phase-1-contract.js
node --check tools/check-security-phase-2a-contract.js
node tools/check-security-phase-2a-contract.js
npm run smoke
npm run smoke:full
```

## Phase 2B / Phase 2C 狀態

Phase 2B 已處理：

- `saveCard`、`updateCard` 的可信 actor 與 owner 驗證。
- `getCardContacts`、`getCardHarvestContacts`、`getCrmContacts`、`updateCrmContact` 的 resource owner / tenant scope 邊界。
- 高風險 action 的 D1 fallback 收斂。

Phase 2C 尚待處理：

- 點數快速查詢 legacy resource fallback 拆分。
- hard admin 判定移除與正式角色來源整理。
- cashier idempotency、點數同步唯一鍵與補償流程。
- 資料庫 schema 或 bindings 調整。