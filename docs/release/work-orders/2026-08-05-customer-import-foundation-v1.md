# 客戶匯入基礎版 V1

## 1. 變更摘要

| 項目 | 內容 |
| --- | --- |
| 日期 | 2026-08-05 |
| 需求來源 | Tony／LINE- 我的客戶 |
| 目標功能 | 建立與名片分離的客戶資料與 Excel／CSV 匯入後端基礎 |
| 起始 commit | ef2f4f3 |
| 是否部署 | 否 |
| 是否執行 Remote D1 | 否 |

## 2. 本次只允許改什麼

- 新增私人、owner/network scoped 的客戶資料表。
- 新增匯入批次、匯入列與名片連結資料表。
- 新增手動客戶 CRUD 與匯入 preview／commit／rollback actions。
- 新增手機、Email 正規化、強重複判斷及公式注入防護。
- 新增 focused tests 與靜態 contract checker。

## 3. 本次禁止碰什麼

- 不把試算表列寫入 `card_contacts`。
- 不修改本人名片、AI 名片夾、公開池或名片歸屬。
- 不自動公開客戶資料、不推定行銷同意。
- 不執行 AI 分析、不扣點。
- 不串 Google OAuth、不做排程同步。
- 不修改 LIFF、Webhook、點數、推薦人、Secret 或 Binding。
- 不部署、不套用遠端 migration。

## 4. 關鍵決策

- `network_id` 承擔目前專案 tenant scope，並與 `owner_user_id` 同時限制每一筆查詢。
- 只有已預覽列能 commit，且 commit 必須帶 `confirmAuthority: true`。
- 姓名不作自動合併鍵；只使用 external ID、正規化手機或 Email 作強候選。
- 匯入更新只填補空白欄位；rollback 以 customer version 防止覆蓋後續人工修改。
- 匯入客戶預設 `is_private=1`、`is_public=0`、`marketing_consent=0`。

## 5. 驗證

- `node --check worker/customer-import.mjs`
- `node test/customer-import.test.mjs`
- SQLite in-memory 重複執行 `0016_customer_import_foundation.sql`
- 遠端 `workerbackup.js` ES module syntax check
- `node tools/check-customer-import-contract.js`（完整 checkout 後執行）

## 6. 上線判斷

- 本工作包僅可進 Draft PR。
- 合併前必須在完整 checkout 執行 `npm run guard:after` 與 `npm run smoke:full`。
- migration 與 Worker 部署需另次取得 Tony 核准。
