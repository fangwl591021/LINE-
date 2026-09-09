# 商城完整圖片與直接上傳

- 起點：6e345c3，乾淨工作樹；需求為圖片滿版及封面/商品圖片按鈕上傳。
- 範圍：store-shop.js、store-shop.css、快取版本、圖片上傳測試及契約。
- 不改 Worker、D1、點數、會員權限、既有名片上傳程式；使用已存在的 authenticated uploadImageToR2。
- 顯示：圖片填滿卡片寬度，保留自然比例，不固定高度裁切；文字區仍有留白。
- 上傳：按鈕選檔、驗證圖片格式/大小、瀏覽器等比壓縮、既有服務上傳、預覽與填入草稿 URL；按儲存後才更改店面/商品。不清除失敗前的原圖或其他欄位。
- 已讀：feature-change-protocol、商城契約、StorageModule.upload 及既有 uploadImageToR2 呼叫點。
- guard before/after PASS；9 項商城 SQLite 測試 PASS；前端語法、git diff --check PASS。
- 隔離 Chrome 手機模擬 390x844：來源 2000x1000 等比處理為 1600x800，卡片顯示 348x174（完整寬度、比例 2:1），無橫向溢出。
- 瀏覽器驗證：店面選檔/預覽/填入草稿、商品上傳按鈕、取消不請求、錯誤格式/超過 10MB/損毀圖片拒絕、上傳失敗保留原 URL/其他欄位、控制項恢復及可重選同檔 PASS。
- 上傳服務使用本機 mock，商城資料庫為記憶體 SQLite；未對正式 R2 上傳測試素材，真實 LINE 手機上傳留待部署後驗收。
- 2026-09-10 使用者後續授權部署：提交並推送本次前端變更，沿用 main 的 GitHub Pages 發布；不部署 Worker、不操作正式 D1/R2 資料。發布前再次通過完整 guard 與 9 項商城測試。
