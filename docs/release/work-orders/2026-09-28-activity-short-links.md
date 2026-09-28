# 活動分享短網址

## 變更摘要

- 日期：2026-09-28；使用者要求「好，修正」，沿用修正後提交部署授權。
- 起始 commit：15faf5111d1a236a6bd2e4ac62c207c00edcc9ea。
- 只改活動分享彈窗的網址、QR、LINE Flex 連結；新增活動專用短碼 API 與唯讀轉址。
- 預計檔案：worker/activity-short-links.mjs、worker-entry.mjs、workerbackup.js、migrations/0051_activity_share_links.sql、js/modules/activities.js、index.html、相關測試／契約／guard。
- 禁止修改：會員／推薦人解析、報名、點數帳本、名片、OA webhook、登入與加好友回跳、其他商城功能、正式 secrets/bindings。

## 契約與檢查

- 已讀 feature-change-protocol、core-invariants、liff-routes、admin-activity-registration、button-actions、points-ledger、regression-matrix。
- guard before：PASS；日誌 %TEMP%/activity-short-before.log。
- guard after：PASS；%TEMP%/activity-short-after.log。
- focused tests：59/59 PASS，包含實際 Worker dispatcher 的未登入拒絕與 token UID 歸因、SQLite 並行唯一限制、原 LIFF 登入／好友返回／報名回歸。
- browser：PASS（320/390/1440px），實際 core.fetchAPI 的回應解包、複製／Flex／QR 同址、關閉／切帳號／換活動舊回應、12 秒逾時及異常網址備援。原活動瀏覽器回歸同時 PASS。
- Wrangler 4.136.3 dry-run、語法及 diff check：PASS。最新 Workers types 5.20260928.1，依 Workers 規範使用 Web Crypto、D1 綁定與目的地白名單。

## 決策

- 不使用第三方縮址、不新增網域、不改 LIFF 初始化。既有 Worker /a/<16 字元隨機碼> 僅轉向既有 LIFF 活動路由。
- createActivityShareLink 使用既有 authenticated policy 與 getActivityById 權限；分享人取已驗證 token UID，網路取活動資料，不接受任意 URL。
- D1 僅新增 activity_share_links，code 主鍵與 (network_id, activity_id, referrer_id) 唯一限制。不可覆盖已有短碼，重試／並行請求重用同一記錄。
- GET/HEAD 不寫資料，無效／下架／移網／DB 故障不猜測活動、不回首頁；保留原長網址。
- 產生期間停用複製／分享；失敗或 12 秒逾時明示原網址備援；晚到回應不改新彈窗或新帳號。
- 正式 migration 僅執行本次 0051 SQL，不批次套用其他待處理 migration；Worker 先上，再發布前端。

## 上線判斷

本機驗證通過；依授權進行 CI／部署，正式版本與 live hash 留 PR。尚未使用真實手機 LINE 分享／報名，測試均為合成身分。

復原前端可回到上述起始 commit；若已發出短網址，Worker 應保留唯讀轉址端點並保留新增表，不可直接回滾移除解析器，避免已分享連結失效。
