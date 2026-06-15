# 現況風險地圖

本文件整理目前 AI工坊專案的高風險區、既有防線與後續修補順序。目的不是新增功能，而是讓後續每次修改前知道哪些地方容易牽一髮動全身。

## 1. 已存在的穩定防線

目前專案已經有一些可用的穩定性文件與檢查腳本，不應重做，應接續使用。

### 文件

| 文件 | 用途 |
| --- | --- |
| `docs/stability-foundation.md` | 定義分支、回復點、Webhook、feature flag、身分橋接與 smoke test 基準 |
| `docs/card-ownership-and-harvest-spec.md` | 定義本人名片、掃描名片、認領、推薦與收錄名單的核心歸屬規則 |
| `docs/auth-stability-contract.md` | 保護 LINE / 點數通身分橋接與每日簽到點數查詢 |
| `docs/identity-diagnostic.md` | 診斷身分、來源、舊資料與錯誤歸屬 |
| `docs/identity-migration-checklist.md` | 身分遷移檢查 |
| `docs/store-ai-knowledge-upload-guide.md` | 店家 AI 知識庫上傳與搜尋範圍規則 |

### 檢查腳本

| 腳本 | 用途 |
| --- | --- |
| `tools/run-smoke-contracts.js` | 基礎 contract smoke test |
| `tools/check-auth-contract.js` | 認證與點數橋接保護 |
| `tools/check-mycard-entry-contract.js` | 我的名片入口保護 |
| `tools/check-own-card-upload-contract.js` | 自己名片上傳邊界保護 |
| `tools/check-lineoa-mycard-keyword-contract.js` | LINE OA 我的名片關鍵字保護 |
| `tools/check-lineoa-cardcool-keyword-contract.js` | LINE OA 名片酷 / AI名片夾關鍵字保護 |
| `tools/check-matchmake-contract.js` | 我的名片池 / 公開交流池隔離 |
| `tools/check-share-contract.js` | 分享與傳送網址行為保護 |
| `tools/check-inbox-recipient-scope-contract.js` | 收件匣收件範圍保護 |
| `tools/check-crm-referrer-contract.js` 或同類腳本 | CRM 推薦人欄位保護 |

若這些腳本已存在，後續應優先擴充，不應另外寫一套互相矛盾的檢查。

## 2. 最高風險區域

### 2.1 我的名片 resolver

風險：

- 我的名片抓到別人的資料。
- 從首頁進入與從設定頁進入結果不一致。
- 多張同 UID 名片互相覆蓋。
- LINE 生成名片、認領名片、自己上傳名片形成多張本人名片。

防線：

- `docs/flows/my-card.md`
- `docs/data/card-ownership-and-versioning.md`
- `docs/card-ownership-and-harvest-spec.md`
- `tools/check-mycard-entry-contract.js`
- `tools/check-own-card-upload-contract.js`

後續補強：

- 明確建立或確認 `resolvePersonalCardByUid()` 類似單一入口。
- 所有「我的名片」入口只能走同一 resolver。
- resolver 回傳需要包含 `cardId`、`ownerUid`、`sourceType`、`version`、`canEdit`。

### 2.2 AI名片夾收錄名單

風險：

- 使用者掃入名單短少。
- 修改歸屬後仍出現在原掃描者列表或不該出現的列表。
- 掃描名片變成本人名片。
- 原始掃描者紀錄遺失。

防線：

- `docs/flows/ai-card-folder.md`
- `docs/card-ownership-and-harvest-spec.md`
- `docs/data/card-ownership-and-versioning.md`

後續補強：

- 建立 scan/import event 與 card row 的稽核查詢。
- 收錄名單必須依 `scannerUid` / `scanner_user_id` 或 identity alias set 查詢。
- 認領不應清除掃描者 visibility。
- 後台需要顯示：掃描者、綁定者、本人名片 / 通訊錄名片、來源。

### 2.3 名片版本隔離

風險：

- 影音名片覆蓋標準版圖片。
- 滿版、正方、標準三種版型讀到不同人的資料。
- 從聊天室進入編輯和從設定區進入編輯結果不一致。
- 裁切比例選了 1:1 / 20:13 / 400:600，但輸出仍固定某比例。

防線：

- `docs/data/card-ownership-and-versioning.md`
- `docs/tests/regression-matrix.md`

後續補強：

- 補名片版本 resolver contract。
- 版本資料應獨立儲存，不可只使用單一 `coverUrl`。
- 靜態名片與影音名片需分 route / mode / keyword。

### 2.4 LINE OA 關鍵字與 LIFF 分享

風險：

- 關鍵字被錯誤 handler 攔截。
- 分享按鈕開到編輯頁或通訊錄，而非正確分享流程。
- `shareTargetPicker()` scope 不足導致空白或紅字。
- Web 版網址誤呼叫 LIFF-only API。

防線：

- `tools/check-lineoa-mycard-keyword-contract.js`
- `tools/check-lineoa-cardcool-keyword-contract.js`
- `tools/check-share-contract.js`
- `docs/rules/core-invariants.md`

後續補強：

- 建立 `docs/contracts/liff-routes.md`。
- 建立 `docs/contracts/line-keywords.md`。
- 每個 keyword 指向唯一 handler，並列出可寫入資料。

### 2.5 點數帳本

風險：

- 母站贈點子站讀不到。
- 子站扣點與母站餘額不同步。
- 前端顯示負數或破版。
- 發訊、優惠券、折抵扣點規則不一致。

防線：

- `docs/auth-stability-contract.md`
- `docs/rules/core-invariants.md`
- `docs/tests/regression-matrix.md`
- `tools/check-auth-contract.js`

後續補強：

- 確認所有點數顯示都走 canonical point UID。
- 點數異動只能新增 ledger，不直接覆寫總額。
- 發訊與優惠券統一扣 10 點。
- 消費折抵使用手動輸入折抵點數。

### 2.6 新用戶入口

風險：

- 新用戶一進來被強制註冊造成流失。
- 尚無名片時點「我的名片」只跳提示，沒有下一步。
- 用 LINE 生成時建立重複名片。

防線：

- `docs/flows/my-card.md`
- `docs/card-ownership-and-harvest-spec.md`
- `tools/check-mycard-entry-contract.js`

後續補強：

- 新用戶首頁直接停留。
- 我的名片閃動提醒。
- 點我的名片直接導入建立流程。
- 建立前先 resolve UID 是否已有本人名片。

## 3. 目前已有文件與新文件的關係

新補文件不是取代既有文件，而是補上中文專案操作層：

| 新文件 | 對應既有文件 |
| --- | --- |
| `docs/rules/core-invariants.md` | `docs/stability-foundation.md` |
| `docs/flows/my-card.md` | `docs/card-ownership-and-harvest-spec.md`、`tools/check-mycard-entry-contract.js` |
| `docs/flows/ai-card-folder.md` | `docs/card-ownership-and-harvest-spec.md`、`tools/check-lineoa-cardcool-keyword-contract.js` |
| `docs/data/card-ownership-and-versioning.md` | `docs/card-ownership-and-harvest-spec.md` |
| `docs/tests/regression-matrix.md` | `tools/run-smoke-contracts.js` 與各 contract check |
| `docs/release/change-checklist.md` | `docs/stability-foundation.md` |

後續若英文 spec 與中文文件衝突，以較嚴格、較能保護 UID 歸屬與資料完整性的規則為準，並立即同步兩份文件。

## 4. 建議修補順序

### 第一階段：只補 contract，不改功能

1. 檢查 `tools/run-smoke-contracts.js` 是否包含新文件提到的核心 contract。
2. 補 `check-card-version-resolver-contract.js`。
3. 補 `check-ai-card-folder-ownership-contract.js`。
4. 補 `check-button-action-url-contract.js`。

### 第二階段：讀現有程式，建立路由與資料地圖

1. 整理 LINE OA keyword 對應 handler。
2. 整理 LIFF mode / query string 對應頁面。
3. 整理 card create / update / resolve 的資料寫入點。
4. 整理點數讀寫點。

輸出文件：

- `docs/contracts/line-keywords.md`
- `docs/contracts/liff-routes.md`
- `docs/contracts/card-resolvers.md`
- `docs/contracts/points-ledger.md`

### 第三階段：小範圍修補

每次只修一個流程：

1. 我的名片 resolver。
2. AI名片夾收錄名單。
3. 名片版本隔離。
4. 按鈕 URL 驗證。
5. 點數扣除與 ledger 顯示。

每次修補都必須先填 `docs/release/change-checklist.md`。

## 5. 當前禁止事項

在上述 contract 補齊前，不建議直接做：

- 大範圍重構 `workerbackup.js`。
- 合併我的名片與 AI名片夾流程。
- 用同一個欄位保存四種名片版本圖片。
- 修改 token / auth fallback。
- 修改點數查詢優先順序。
- 修改 LINE OA webhook route order。
- 直接批次修復名片歸屬而沒有 dry run。

## 6. 最小安全工作流

後續任何修補都應走：

1. 選定單一流程。
2. 填 `docs/release/change-checklist.md`。
3. 對照本文件確認風險。
4. 先補或更新 contract check。
5. 再改程式。
6. 跑 smoke contracts。
7. 手機 LINE 實測。
8. 記錄可回復 commit。

若任一步做不到，不應部署正式 Worker。
## Contracts Added 2026-06-14

- `docs/contracts/line-keywords.md`: fixes one keyword to one flow and forbids cross-domain writes.
- `docs/contracts/liff-routes.md`: separates view, edit, send, share, and web routes.
- `docs/contracts/card-resolvers.md`: defines personal, collected, and public-pool card resolver boundaries.
- `docs/contracts/points-ledger.md`: defines canonical point identity, ledger writes, and 10-point operation costs.
- `docs/contracts/button-actions.md`: defines button URL, phone, email normalization and save validation.

These contracts are documentation only. They do not change runtime behavior until code and tests are updated against them.
