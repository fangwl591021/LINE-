# 確認活動修改表單的分類補漏

- 需求：用戶截圖確認入口是會員辦活動的「確認活動修改」，不是獨立 admin.html。
- 起點：LINE- origin/main 53abbb4dc6b48a9601009748252b7bb864805b1d；branch codex/member-event-category；Worker line-engine，D1 actmaster_db。
- 只改：會員活動確認草稿／修改表單的 category、API 白名單與持久化投影、單一新增欄位 migration、相關測試及版本號。
- 不改：官方 activities、梯次、會員 resolver、點數、LINE、金鑰、AI 辨識、DM、報名／核銷、公開權限、私人行程；不重建既有活動。
- 預計檔案：js/modules/member-hosted-events.js、worker/member-hosted-events.mjs、migrations/0057_member_event_category.sql、index.html、test/helpers/member-events-fixture.mjs、會員活動測試與合約。
- 必讀：member-hosted-events、core-invariants、feature-change-protocol；Workers best practices 及 Wrangler skills。
- before：完整 guard PASS（member-event-category-guard-before.log）。
- after：完整 guard PASS（member-event-category-guard-after.log）；25項聚焦測試PASS，Worker dry-run PASS。
- 方案：活動名稱下放分類輸入／常用選項，自訂1–40字；舊活動預設活動；舊客戶端修改省略分類時保留現值。
- 驗證：新增／修改／重新開啟分類；有效分類／空白／過長／錯誤型別；非主辦與 stale revision 仍拒絕；DM、ID、主辦、報名／QR不變。本機實際前端搭配同一Worker/SQLite fixture，常用／自訂分類、重新開啟、失敗留編輯器及同筆重試通過；一筆活動與一筆報名均保留。
- 瀏覽器尺寸限制：in-app viewport override未套用要求尺寸，實際DOM viewport為520px，不將其宣稱為320／390px驗收或實機結果；分類欄位及按鈕在實際畫面可見。
- 部署：先核對 remote schema／migration，只加0057，再以 keep-vars 部署 line-engine，最後 Pages；保留設定、bindings、secrets、cron；不修改正式活動內容做測試。
- Remote preflight：正式兩筆會員活動、revision總和1、會員報名0；無category欄位。0042／0043為無關未套用migration，透過只含0057且內容SHA256相同的migration-only config隔離，避免套用舊migration。
- 回復：Worker前版4c899846-cc25-421b-83b7-54ba78851ee6，Pages基準53abbb4；保留新增 category 欄位及資料，不刪資料。
