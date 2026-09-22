# 掃描名片完整聯絡按鈕修復

- 需求：客戶回報掃描後僅電話、地址，須保留 Email、網站、公司電話等資訊。
- 起始：main / 5c90da92d76944ac1c4addb84d0eeda824021b17，工作區乾淨。
- 範圍：scanner adapter 的 OCR 欄位映射及儲存按鈕；ecard 的聯絡按鈕與分享；mycard 共用編輯器的 recordMode；index 快取版本與回歸測試。
- 禁止：不改本人名片上限、會員身分、歸屬、點數、資料庫、Worker secrets；不批次改舊資料。
- 已讀：feature-change-protocol、button-actions、core-invariants、ai-card-folder。
- 修改前：node tools/run-change-guard.js before PASS。
- 修改後：node tools/run-change-guard.js after PASS（完整既有契約及新增六項測試）。
- 另測：check-a-kaffit-full-card-workflow、check-a-kaffit-recognize-backend-port 均 PASS；git diff --check PASS。
- 瀏覽器：Edge headless 390×844 合成資料驗證六項聯絡按鈕顯示、儲存後重開保留六項；全部刪除後儲存、重開不補回。API 僅測試替身，未寫正式資料，未送實際 LINE 訊息或呼叫付費 OCR。
- 未驗證：客戶原始名片圖片未提供，無法確認該張原圖 OCR 是否另有漏辨識。正式手機 LINE 尚未驗收。
- 根因：新版 OCR 保留欄位但未產生自訂聯絡按鈕，預設生成器只產生 LINE／電話／地址；通訊錄共用本人編輯器再截成四顆。
- 舊卡處理：僅無已設定按鈕時依既有欄位呈現；不覆寫使用者刪除或自訂的按鈕。缺少原始 OCR 欄位者仍需原圖重新辨識。
- 部署：使用者後續明確要求「部署」。本次僅發布 GitHub Pages 前端，不需 Worker 部署或資料庫 migration；合併前確認 CI，發布後比對正式 HTML 與三支新版 JS 的 SHA-256。
