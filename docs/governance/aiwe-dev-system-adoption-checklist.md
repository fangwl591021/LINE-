# LINE 專案導入 aiwe-dev-system 清單

日期：2026-07-10

本文件用來把 `fangwl591021/aiwe-dev-system` 的規範方式導入 LINE 專案。導入目標是整理文件、保護規則與修改流程，不接入新 runtime，不搬動主程式，不修改任何功能程式。

## 1. 導入定位

`aiwe-dev-system` 在本專案中的角色：

- 開發規範來源。
- 專案決策與狀態整理方式。
- 可重用模組的索引與審查方式。
- Codex 修改任務的前置檢查標準。

`aiwe-dev-system` 不是：

- LINE 專案的執行後端。
- 母站或子站的替代系統。
- 共同資料庫。
- monorepo。
- 部署目標。

固定原則：

> 產品獨立，規範共用，知識沉澱，模組可移植。

## 2. 本專案優先保護區

以下區域屬於高風險流程，任何功能修改前都必須先讀文件、確認範圍、跑 guard。若使用者只要求修某一項，不得順手修改其他項。

| 保護區 | 先讀文件 | 禁止事項 |
| --- | --- | --- |
| 點數收銀、贈扣點、會員同步 | `docs/contracts/store-point-cashier-protected-flow.md`、`docs/contracts/points-ledger.md`、`docs/rules/core-invariants.md` | 未經同意不得改點數流程；不得把查詢失敗寫成 0；不得把名片或影音邏輯混進點數 |
| 我的名片 | `docs/flows/my-card.md`、`docs/data/card-ownership-and-versioning.md`、`docs/contracts/card-resolvers.md` | 不得用姓名、電話或最後一次資料猜本人名片；不得把 AI 名片夾資料當本人名片 |
| AI 名片夾 | `docs/flows/ai-card-folder.md`、`docs/data/card-ownership-and-versioning.md` | 不得搶走他人名片歸屬；不得把掃描者資料覆蓋原持有人 UID |
| 名片四版型 | `docs/data/card-ownership-and-versioning.md`、`docs/contracts/card-resolvers.md` | 標準、滿版、正方、影音不得互相覆蓋封面、縮圖、裁切或影片資料 |
| 影音名片 | `docs/rules/core-invariants.md`、`docs/data/card-ownership-and-versioning.md` | 不得為了修影音而動靜態名片資料；影音版應獨立處理 |
| 按讚與未來贈點 | `docs/rules/core-invariants.md`、`docs/contracts/points-ledger.md` | 不得匿名贈點；不得讓自己按自己名片取得點數；不得繞過 LIFF UID 判斷 |
| LINE OA 關鍵字、LIFF、分享 | `docs/contracts/line-keywords.md`、`docs/contracts/liff-routes.md` | 不得用 push 補救 reply 流程；不得讓子站關鍵字排擠母站回覆 |
| 按鈕、電話、網址 | `docs/contracts/button-actions.md` | 不得儲存不合法 `tel:`、`mailto:`、`http(s):` 連結 |

## 3. 文件對照與補齊清單

目前 LINE 專案已具備多數保護文件。導入 `aiwe-dev-system` 時，不重複建立同名規格，先把現有文件視為主規格。

| aiwe-dev-system 類型 | LINE 專案現況 | 處理方式 |
| --- | --- | --- |
| 專案總覽 | `docs/README.md` | 保留，作為 LINE 專案文件入口 |
| 核心規則 | `docs/rules/core-invariants.md` | 保留，作為最高層不變規則 |
| 變更流程 | `docs/release/feature-change-protocol.md`、`docs/release/change-checklist.md`、`docs/release/change-work-order-template.md` | 保留，功能修改前必讀 |
| 已知風險 | `docs/audit/current-risk-map.md`、`docs/audit/stale-contracts.md` | 繼續更新，不另建散落文件 |
| 回歸測試 | `docs/tests/regression-matrix.md` | 每次高風險修改後更新 |
| 資料歸屬 | `docs/data/card-ownership-and-versioning.md` | 作為名片與版型資料主規格 |
| API / 合約 | `docs/contracts/*.md` | 依功能區分，修改前先讀 |

建議後續只補最小缺口：

- `docs/project-status.md`：目前穩定版本、部署點、已知可回復 commit。
- `docs/next-sprint.md`：下一輪只允許處理的項目。
- `docs/decisions.md`：已定案決策，例如「母站為會員與點數主來源」。

## 4. 功能修改前固定流程

任何功能修改都必須走以下流程：

1. 判斷本次修改屬於哪個保護區。
2. 讀取對應文件。
3. 建立或填寫單次工作單。
4. 跑修改前 guard。
5. 只修改本次允許的最小檔案。
6. 跑修改後 guard。
7. 若涉及部署，先確認回復點。
8. 回報：
   - 改了哪些文件。
   - 沒碰哪些高風險區。
   - 驗證結果。
   - 是否部署。

標準指令：

```powershell
npm run guard:before
npm run guard:after
```

若使用者只要求研究、分析、檢查、規劃，不得直接修改功能程式。

## 5. Codex 任務保護句型

後續開任務時，建議優先使用以下句型，避免改錯範圍。

### 點數任務

```text
只檢查點數流程。先讀 docs/contracts/store-point-cashier-protected-flow.md 與 docs/contracts/points-ledger.md。
除非我明確同意，不得修改點數收銀保護流程，也不得碰名片、影音、按讚。
```

### 名片任務

```text
只檢查我的名片與名片版本 resolver。先讀 docs/flows/my-card.md、docs/data/card-ownership-and-versioning.md。
不得碰點數、LINE OA 關鍵字、收銀流程。
```

### 影音名片任務

```text
只檢查影音名片。影音資料必須獨立於標準、滿版、正方。
不得修改靜態名片封面、按讚來源、點數流程。
```

### LINE OA / LIFF 任務

```text
只檢查 LINE OA 關鍵字、LIFF 或分享路由。先讀 docs/contracts/line-keywords.md 與 docs/contracts/liff-routes.md。
不得用 push 補救 reply 流程，不能影響母站既有回覆。
```

## 6. 本專案目前的收斂方向

以下決策若要改動，必須先更新文件並取得使用者同意：

- 會員與點數以母站為主要來源。
- 子站加入後應能同步母站會員與點數狀態。
- 加入 LINE@ 好友後不應查無會員。
- 子站不再各自發散建立點數帳本。
- 點數收銀流程已受保護，後續點數問題修改前必須先詢問使用者。
- 我的名片與 AI 名片夾必須分開。
- 四種名片版型共用 UID，但版型素材必須獨立。

## 7. 不導入事項

為避免增加混亂，以下事項暫不導入：

- 不把 `aiwe-dev-system` 程式碼複製進 LINE 專案。
- 不新增共用後端。
- 不新增另一套部署流程。
- 不把母站資料搬入子站成為第二主資料源。
- 不把文件整理與功能修補混在同一次變更。

## 8. 驗收標準

本導入清單完成後，應達成：

- 任何人接手修改前，能先知道該讀哪份規格。
- 高風險功能不會被其他任務順手改壞。
- 點數、名片、影音、LIFF、LINE OA 的責任邊界明確。
- 後續若要把可重用模組沉澱到 `aiwe-dev-system`，只搬規格與模板，不搬未穩定的產品程式。
