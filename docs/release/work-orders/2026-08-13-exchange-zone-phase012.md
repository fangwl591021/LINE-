# 交流專區 Phase 0-2 私人入口、公開列表與右側抽屜

﻿# 單次變更工作單模板

用途：每次修改功能前，先複製本模板到任務紀錄、PR 說明或 issue。
原則：先確認規格與風險，再改程式；改完後必跑 regression。

## 1. 變更摘要

| 項目 | 內容 |
| --- | --- |
| 日期 | 2026-08-13 |
| 需求來源 | 使用者要求新增仿 LINE 清單的交流專區；正式開放前僅管理員本人可見 |
| 目標功能 | 交流專區 Phase 0-2 私人入口、公開列表與右側抽屜 |
| 起始 commit | 815d6aa |
| 預計修改檔案 | `migrations/0021_exchange_zone_foundation.sql`、`worker/exchange-zone.mjs`、`workerbackup.js`、`wrangler.toml`、`index.html`、`js/core.js`、`js/navigation.js`、`js/modules/exchange-zone.js`、契約/單元測試與規格文件 |
| 是否部署 | 否 |
| 回復點 / tag |  |

## 2. 本次只允許改什麼

```text
- 建立交流專區 PRIVATE/PILOT/OPEN 讀取開關，預設 PRIVATE。
- 建立不含假資料的 D1 公開刊登資料骨架。
- 建立管理員私人測試入口、LINE 式文字清單、聯絡標籤與電子名片預覽。
- 點選刊登時以右側抽屜顯示全文，X/遮罩收回且不跳離目前頁面。
- 僅提供讀取流程；本階段不提供新增、編輯、扣點或付款。
```

## 3. 本次禁止碰什麼

```text
- 不改 UID resolver、card owner、scannedBy、推薦歸屬或名片版本。
- 不改點數 ledger，也不建立扣點、訂單、付款或核銷流程。
- 不改 LINE OA webhook、關鍵字、分享、收件匣或合作店家資料。
- 不加入正式假刊登、不公開一般會員入口、不改正式 Worker secrets。
```

## 4. 影響流程

- [ ] 我的名片
- [ ] AI名片夾
- [ ] 名片 OCR / 收錄名單
- [ ] 名片版本：標準 / 滿版 / 正方 / 影音
- [ ] LINE OA keyword
- [ ] LIFF route
- [ ] 分享 / 推播 / shareTargetPicker
- [ ] 點數 / 優惠券 / 發訊免費傳送
- [ ] 收件匣
- [ ] 跟進
- [x] 公開池 / AI配對
- [x] 後台 CRM / 權限
- [x] 其他：首頁入口、交流專區唯讀清單、右側抽屜

## 5. 修改前必跑

```powershell
npm run guard:before
```

結果：

```text
PASS：起始 commit 815d6aa 的完整 smoke contracts 通過。
```

若 FAIL：停止，不修改程式，先修復既有破損或回報。

## 6. 必讀規格

按本次影響範圍勾選：

- [x] `docs/rules/core-invariants.md`
- [x] `docs/flows/my-card.md`
- [ ] `docs/flows/ai-card-folder.md`
- [ ] `docs/data/card-ownership-and-versioning.md`
- [ ] `docs/contracts/line-keywords.md`
- [ ] `docs/contracts/liff-routes.md`
- [ ] `docs/contracts/card-resolvers.md`
- [ ] `docs/contracts/button-actions.md`
- [ ] `docs/contracts/points-ledger.md`
- [x] `docs/tests/regression-matrix.md`

## 7. 不變規則確認

- [x] 一個 UID 只能解析到自己的「我的名片」。
- [x] AI名片夾掃入名片不可變成本人名片。
- [x] 標準、滿版、正方、影音四種版本互不覆蓋。
- [x] `scannedBy`、推薦人、歸屬網不可被姓名或電話覆蓋。
- [ ] 無推薦人時可 fallback 到 admin，但必須可標記。
- [ ] 分享按鈕、傳送按鈕、網頁版按鈕各走自己的路徑。
- [x] 發訊與優惠券免費傳送，不扣發送者點數。
- [x] 消費折抵只使用手動輸入折抵點數。

## 8. 實作紀錄

實際修改檔案：

```text
migrations/0021_exchange_zone_foundation.sql
worker/exchange-zone.mjs
workerbackup.js
wrangler.toml
index.html
js/core.js
js/navigation.js
js/modules/exchange-zone.js
tools/check-exchange-zone-contract.js
test/exchange-zone.test.mjs
tools/run-smoke-contracts.js
package.json
docs/exchange-zone/phase-0-2-private-read-only.md
docs/release/work-orders/2026-08-13-exchange-zone-phase012.md
```

關鍵決策：

```text
- PRIVATE 預設 fail-closed，只有後端驗證為 admin 且列入 EXCHANGE_ZONE_PRIVATE_TESTER_IDS 的本人帳號可見。
- 私測 LINE 使用者識別碼不寫入儲存庫；部署時由 Cloudflare Secret 提供。
- 前端按鈕預設 hidden，必須由 Worker 回傳 allowed=true 才顯示；list/get API 各自重做同一權限判斷。
- 清單只讀 published；migration 不建立假資料，Phase 0-2 不提供任何 write action。
- 電子名片只顯示 public self_profile 且作者一致的公開摘要，不回傳 UID、數字 ID 或 card row ID。
- 詳細內容留在原頁，以右側抽屜顯示，X/遮罩關閉並恢復觸發按鈕焦點。
- 不接點數、訂單、付款、核銷或 ledger。
```

## 9. 修改後必跑

```powershell
npm run guard:after
```

結果：

```text
PASS：完整 smoke contracts、exchange zone 聚焦契約/單元測試、語法檢查與 git diff --check 均通過；Wrangler 4.122.0 dry-run 通過。
```

## 10. 人工驗證

依需求填入實測項目：

| 測試項目 | 測試帳號 / UID | 結果 | 備註 |
| --- | --- | --- | --- |
| PRIVATE 指定本人 | 模擬指定 tester | PASS | 入口與 API 允許 |
| PRIVATE 其他 admin | 模擬其他 admin | PASS | API 拒絕、入口維持隱藏 |
| PRIVATE 一般會員 | 模擬一般會員 | PASS | API 拒絕且不讀 D1 |
| OPEN 一般會員契約 | 模擬一般會員 | PASS | 開關改 OPEN 後讀取允許 |
| 公開清單隱私 | fixture | PASS | 不輸出 UID、數字 ID、card row ID |
| 右側抽屜 | 靜態契約 | PASS | 不呼叫 window.open/window.location；X/遮罩收回 |
| D1 migration | Wrangler local | PASS | 3 commands executed successfully |
| Android LINE LIFF 實機 | 待部署後 | 待驗證 | 本次未部署 |

## 11. 上線判斷

- [x] guard before 通過。
- [x] guard after 通過。
- [x] 修改範圍符合第 2 節。
- [x] 沒有碰第 3 節禁止區域。
- [x] 已確認是否需要部署 Worker / Pages。

結論：

```text
可部署：須先套用 0021 migration，再部署 Worker 與前端；保持 PRIVATE。此工作單目前僅本機完成，未提交、未套用正式 migration、未部署。
```
