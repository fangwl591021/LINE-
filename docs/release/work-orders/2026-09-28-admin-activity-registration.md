# 單次變更工作單：Admin 活動報名管理

## 1. 變更摘要

- 日期：2026-09-28
- 需求：補 admin 活動報名模組，參照福委會的分區方式，手機與後台共用既有資料。
- 起始 commit：b154867c1b19bc3d6db595c15d2bb8d19fcda60a
- 預計檔案：admin.html、活動管理專用 JS/CSS、合約、針對性測試、guard 清單。
- 是否部署：是（沿用使用者「以後修正好就直接部署」授權）；僅 Pages。
- 回復點：上述起始 commit。

## 2. 本次只允許改什麼

活動頁總覽／篩選、單一活動報名與簽到名單、搜尋／狀態篩選、CSV 匯出、手機既有單筆簽到及確認繳費入口。保留原活動編輯／複製／上下架。

## 3. 本次禁止碰什麼

不改手機版、Worker／資料庫／migration、登入驗證、會員歸屬、點數、商城、私訊及福委會資料。不增加抽獎、退款、代報或自動發點流程。

## 4. 影響流程

- [x] 後台活動管理與既有管理員 API 介接
- [ ] 手機活動流程／身份／名片／商城／點數

## 5. 修改前必跑

`node tools/run-change-guard.js before`：PASS（2026-09-28）。

## 6. 必讀規格

已讀 feature-change-protocol、core-invariants、admin-entry；新增 admin-activity-registration 合約。福委會僅參考管理頁分區，不移植 API 或資料。

## 7. 不變規則確認

沿用已驗證 LINE 管理身分、既有 activities / registrants 資料及原管理 API；不改權限、所有權、點數、秘密或其他功能。

## 8. 實作紀錄

- `admin.html`：既有活動頁改名、名單入口與登入後活動深連結；保留編輯／複製／上下架。
- `js/modules/admin-activity-registration.js`、`css/admin-activity-registration.css`：總覽、篩選、名單、手動簽到／繳費、CSV、載入失敗與遲到回應保護。
- `docs/contracts/admin-activity-registration.md`：補充範圍與安全合約。
- `test/admin-activity-registration.test.mjs`、`test/admin-entry.test.mjs`、`test/browser/admin-activity-registration.mjs`、`tools/run-smoke-contracts.js`：行為測試與 guard 鎖定。
- 未增報名／活動 API、資料表或正式資料修補；未載入報名數不再假顯示 0。

## 9. 修改後必跑

- `node --test test/admin-activity-registration.test.mjs test/admin-entry.test.mjs`：15 / 15 PASS。
- `node test/browser/admin-activity-registration.mjs`：PASS；完整 admin shell、合成 LINE 管理員、正式 API 全數攔截。
- `node tools/run-change-guard.js after`：PASS。
- `node --check js/modules/admin-activity-registration.js`、`git diff --check`：PASS。

## 10. 人工驗證

以合成資料驗證 320／390／1440 px、控制項可點擊且未裁切、活動與名單篩選、CSV、取消報名保護、遲到回應、列表／名單讀取失敗、模擬簽到回應遺失（不重送）、繳費後重新核對。未使用真實會員或寫入正式資料。截圖在執行機 TEMP/admin-activity-registration-20260928。

測試環境曾因外部 Tailwind 下載逾時及被阻擋的頭像 fallback 重試導致失敗；頭像改用合成像素後重新通過，未修改正式頭像功能。

## 11. 上線判斷

可提交與部署 GitHub Pages；無 Worker 或 migration 部署。既有 API 每次最多 500 筆，頁面達上限會提示，不宣稱完整匯出。正式 LINE 身分互動與真實報名寫入未由本次合成測試覆蓋。
