# AI工坊專案文件入口

本目錄是 AI工坊專案的工程約束文件。目的不是補說明文字，而是讓後續每一次修改都能先確認邊界，避免 UID、名片、點數、LIFF、Webhook 互相污染。

## 使用原則

修改程式前，先判斷本次修改屬於哪一類：

| 修改類型 | 先讀文件 |
| --- | --- |
| UID、推薦人、歸屬網、掃描者 | `docs/rules/core-invariants.md`、`docs/data/card-ownership-and-versioning.md` |
| 我的名片、個人專屬名片、LINE 生成名片 | `docs/flows/my-card.md` |
| AI名片夾、OCR、掃描名片、收錄名單 | `docs/flows/ai-card-folder.md` |
| 標準 / 滿版 / 正方 / 影音名片 | `docs/data/card-ownership-and-versioning.md` |
| 發訊、優惠券、點數扣除、點數同步 | `docs/rules/core-invariants.md`、`docs/tests/regression-matrix.md` |
| LINE OA keyword、LIFF、分享、Webhook | `docs/rules/core-invariants.md`、`docs/tests/regression-matrix.md` |
| 上線或部署 | `docs/release/change-checklist.md` |
| 單次功能修改 | `docs/release/change-work-order-template.md` |
| 查詢修改風險範圍 | `docs/contracts/change-risk-map.json` |

## 文件清單

### 治理與導入

- `docs/governance/aiwe-dev-system-adoption-checklist.md`

定義 `aiwe-dev-system` 如何作為 LINE 專案的規範與知識來源。此導入只整理文件與保護規則，不接入 runtime、不搬主程式、不修改功能程式。

### 安全稽核

- `docs/security/security-audit-phase-1.md`
- `docs/security/action-authorization-policy.md`

Phase 1 安全稽核，只盤點 `workerbackup.js` 的認證、授權、D1 identity fallback、硬編碼管理員與點數異動風險；本階段不修改正式功能。

Phase 2A Action Authorization Policy 定義 `dispatchAction()` 的集中式 action policy、deny-by-default 原則、public action 清單與 D1 fallback action 清單。
### 核心規則

- `docs/rules/core-invariants.md`

定義專案不可違反的底層規則。任何修改如果碰到 UID、名片歸屬、版本、點數、LIFF 或 webhook，都要先對照這份。

### 流程文件

- `docs/flows/my-card.md`
- `docs/flows/ai-card-folder.md`

分別定義「我的名片」與「AI名片夾」流程。這兩個流程不可混用。

關鍵界線：

- 我的名片 = 本人 UID 的個人專屬名片。
- AI名片夾 = 自己掃進來或上傳建立的他人通訊錄名片。

### 資料規格

- `docs/data/card-ownership-and-versioning.md`

定義名片資料應如何儲存、查詢、分版本與稽核。後續若要補 resolver、清理歸屬或做資料修復，應以這份為基準。

### 回歸測試

- `docs/tests/regression-matrix.md`

列出目前最容易壞的功能測試。每次修改高風險流程前後，都應至少跑相關測試。

### 發版檢查

- `docs/release/change-checklist.md`

每次修改前與部署前填寫。目的在於確認本次變更範圍、風險、測試與回復點。

### 單次變更工作單

- `docs/release/change-work-order-template.md`

每次改功能前先複製這份工作單，明確寫下本次只改什麼、禁止碰什麼、修改前後 guard 結果。這份用來防止小改動牽動 UID、名片版本、點數或 LIFF 路徑。

可用指令建立新工作單：

```powershell
npm run workorder:new -- my-feature "My feature title"
```

### 風險區域對照表

- `docs/contracts/change-risk-map.json`

修改前可先查本次功能應讀哪些文件、跑哪些 contract：

```powershell
npm run scope:lookup -- my-card
npm run scope:lookup -- 點數
```

## 高風險區域

以下區域修改前必須先看文件，不可直接改：

- 本人名片查詢
- AI名片夾列表查詢
- 掃描名片 OCR 建立
- 名片認領 / 綁定
- 名片版本切換
- 影音名片
- 分享與推播
- LIFF token / scope
- 點數 ledger
- 推薦人與歸屬網

## 開發前最低流程

1. 判斷本次修改影響哪個流程。
2. 閱讀對應文件。
3. 在 `docs/release/change-checklist.md` 填寫本次變更。
4. 確認不變規則是否會被破壞。
5. 修改程式。
6. 跑回歸測試矩陣中對應項目。
7. 記錄回復點。

## 禁止做法

- 不確認資料來源就改 resolver。
- 看到欄位缺失就用姓名或電話猜 UID。
- 為了修聊天室推播而改我的名片資料結構。
- 為了修影音名片而覆蓋靜態名片封面。
- 為了讓新用戶進站順暢而放寬 admin API 權限。
- 沒有回復點就部署正式 Worker。

## 推薦後續補強

後續可再新增：

- `docs/audit/current-risk-map.md`
- `docs/contracts/api-contracts.md`
- `docs/contracts/liff-routes.md`
- `docs/contracts/button-actions.md`
- `docs/release/rollback-points.md`

這些文件可以在開始整理現有程式後再補，不必一次完成。
## Contracts Added 2026-06-14

- `docs/contracts/line-keywords.md`
- `docs/contracts/liff-routes.md`
- `docs/contracts/card-resolvers.md`
- `docs/contracts/points-ledger.md`
- `docs/contracts/button-actions.md`

Before changing LINE OA keywords, LIFF routes, card lookup, points, or card buttons, read the matching contract first and update the regression matrix if the contract changes.

## Change Guard Added 2026-06-15

- `docs/release/feature-change-protocol.md`
- `tools/run-change-guard.js`

Required rhythm for functional changes:

```powershell
node tools/run-change-guard.js before
# edit the smallest scoped files
node tools/run-change-guard.js after
```

Both guard commands run the full smoke contracts. Do not deploy when either command fails.

## Standard Guard Commands

Use these npm script aliases from the repository root:

```powershell
npm run guard:before
# make the smallest scoped change
npm run guard:after
```

Useful direct checks:

```powershell
npm run smoke
npm run smoke:full
npm run smoke:list
```

`smoke` runs the foundation contracts. `smoke:full` runs every `tools/check-*-contract.js` script currently registered in the full guard.

## GitHub Guard

GitHub Actions runs the same full contract guard on:

- push to `main`
- pull requests targeting `main`

Workflow file:

- `.github/workflows/contract-guard.yml`

The workflow intentionally does not run `npm install` because the guard scripts use only Node built-ins.
## Card Stabilization 0

- `docs/cards/card-stability-audit.md`
- `docs/cards/card-target-model.md`
- `docs/cards/card-migration-strategy.md`
- `tools/audit-card-stability.js`
- `tools/trace-card-resolution.js`

Card Stabilization 0 is a read-only audit of card entrypoints, identity fields, source types, version detection, and resolver divergence. The tools operate only on local snapshots and reject remote/write modes.
