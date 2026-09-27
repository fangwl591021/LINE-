# 單次變更工作單：補上新增活動入口

## 1. 變更摘要

- 需求：使用者回報「我沒看到新增活動功能」，補上上一版遺漏。
- 日期：2026-09-28；起始／回復 commit：43ad24ab2a6b8e004623e6846459ef479ae48c48。
- 預計修改：admin.html 資源版號、活動管理 JS/CSS、相關單元／瀏覽器測試、此工作單與活動管理合約。
- 部署：依使用者持續授權，測試通過後提交並部署 Pages。

## 2. 本次只允許改什麼

活動頁「＋新增活動」、單一活動表單與手機既有 bulkAddRegistrants / uploadImageToR2 API 介接、送出鎖定與同 ID 人工重試、成功刷新名單。

## 3. 本次禁止碰什麼

不改 Worker、資料庫、migration、身份／歸屬規則、點數、手機活動流程、既有編輯、商城、聊天、福委會資料。正式環境不建立測試活動。

## 4. 影響流程

- [x] Admin 活動建立前端
- [ ] 其他功能、會員或點數

## 5. 修改前必跑

`node tools/run-change-guard.js before`：PASS。

## 6. 必讀規格

feature-change-protocol、change-work-order-template、core-invariants、admin-entry、admin-activity-registration；核對手機 activities.js 的 submitActivityForm 與後端 bulkAddRegistrants / normalizeActivity 欄位。

## 7. 不變規則確認

既有 LINE 管理員驗證與歸屬來源不變；names 為空，不代報、不發點，不覆寫既有活動。

## 8. 實作紀錄

- 修改 `js/modules/admin-activity-registration.js` 與專用 CSS，新增可見入口／原生 dialog 表單、R2 宣傳圖上傳、上架或草稿。
- `admin.html` JS／CSS 版號改為 v2，保留既有編輯函式；既有手機端與 Worker 均未修改。
- 同一表單保留 activityId 及送出快照；忙碌時禁止連點、修改與取消；錯誤後關閉再開仍續用同一筆，避免誤新增第二筆。
- 新增測試並擴充既有完整 admin shell 的瀏覽器驗證。

## 9. 修改後必跑

- `node --test test/admin-activity-registration.test.mjs test/admin-entry.test.mjs`：18 / 18 PASS。
- `node test/browser/admin-activity-registration.mjs`：PASS，合成帳號與 API 攔截，320／390／1440 px。
- `node tools/run-change-guard.js before`、`node tools/run-change-guard.js after`：PASS。
- `node --check js/modules/admin-activity-registration.js`、`git diff --check`：PASS。

## 10. 人工驗證

合成資料已驗證桌面／手機新增入口、時間驗證、取消不建立、圖片上傳失敗阻擋及成功、送出防連點、回應遺失人工重試同 ID／快照且不重複新增、上架／草稿，以及既有名單操作。截圖位於執行機 TEMP/admin-activity-registration-20260928/create-*.png。

## 11. 上線判斷

通過相關測試；after guard 與 CI 通過才合併並部署 Pages。無正式測試寫入、無 Worker 或 migration 部署。LINE 真實登入與正式新增活動由管理員正常使用確認。
