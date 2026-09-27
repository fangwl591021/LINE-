# 新增活動 AI DM 上架補漏

## 1. 變更摘要
- 日期：2026-09-28；使用者指出未依福委會 AI 上架，已同意沿用金鑰及既有自動提交部署授權。
- 起始：429bb762cd39bc0b18dc92f699e8efdd3eb99b45；回復點同此。
- 目標：活動 DM 圖片辨識、可編修草稿、人工確認後上架。
- 預計檔案：admin.html、活動管理 JS/CSS、worker/activity-dm-ai.mjs、workerbackup.js 的 import/policy/rate/action、對應測試及合約。
## 2. 允許範圍
- 僅新增活動 AI 輔助流程，沿用 uploadImageToR2、AIModule.callOpenAI、manager 驗證、bulkAddRegistrants。
## 3. 禁止範圍
- 不改名片、會員／權限規則、點數、NFC、手機流程、福委會來源、正式資料、secrets、資料庫 migration。
## 4. 影響流程
- Admin 活動新增。AI 回填不直接發布，既有手動模式保留。
## 5. 修改前
- `node tools/run-change-guard.js before` PASS。
## 6. 已讀規格
- feature-change-protocol、core-invariants、admin-activity-registration。
- 福委會 src/index.js 的 extractActivityDmDraft 與後台 DM 回填表單，唯讀參考。
## 7. 不變規則
- 身分、歸屬、名片、點數及報名資料不變。人工確認前不建立活動。
## 8. 實作紀錄
- 實際檔案同預計範圍，新增 test/activity-dm-ai.test.mjs 並納入 full guard；無 migration。
- AI 使用既有後端 OpenAI，不新增 key、不自動發布。圖片只接受本機上傳 data URL；地點整合至既有說明，未知價格留空。
- 預覽安全轉義，覆蓋手動欄位前確認，套用後可修改且須勾選人工確認。送出仍沿用唯一 activityId 與原重試快照。
## 9. 修改後
- guard after PASS；25 項相關 unit/auth 測試 PASS。
- 瀏覽器 320/390/1440 PASS：原列表／名單／CSV／簽到／付款、人工新增、上傳失败、重試冪等、AI 失敗保留欄位、AI busy lock、XSS 安全預覽、未知金額阻擋、人工修改重設確認、確認上架。
- Wrangler 4.137.0 dry-run PASS（1305.27 KiB，gzip 286.25 KiB）；git diff --check PASS。
## 10. 人工驗證
- 使用 mock LINE 身分與 AI 回覆驗證瀏覽器，不建立正式測試活動。未以真實管理員帳號呼叫正式 OpenAI；實際 DM 辨識品質需由使用者選圖核對。
- 手機圖已檢視：預覽可內部捲動，取消／建立與關閉固定可見。
## 11. 上線判斷
- 本機檢查全部通過，可發布 Worker + GitHub Pages；保留所有 bindings/vars。Worker 回復版本 908acbcd-b273-405e-a954-d1e99e5ea85c。
