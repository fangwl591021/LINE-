# 分享好友操作教學工作單

- 日期：2026-10-10；需求：補做分享好友操作影片並上架教學區。
- 正確專案：LINE-；起點 `53eaead91abe5db38d8088e533d30f55eba29316`，正式 GitHub Pages `/LINE-/`。
- 範圍：新增 `friend-share` 影片與教學 metadata，放入會員與名片；保留四個橫向分類與原十三支影片。
- 檔案：tutorial-center.js、index.html 版本、教學契約／單元與瀏覽器測試／本工作單、獨立教學錄製與剪輯、媒體與正式驗證腳本。CRM 分享檔案未變動，僅補取消／失敗的既有流程測試。
- 禁止：不改推薦歸屬、身分、CRM 分享程式、登入、點數、Worker、secrets；不對真人送 LINE 訊息。
- 已讀：core-invariants、feature-change-protocol、tutorial-center、liff-routes；LINE 推薦好友規則與實際邀請程式。
- guard before：PASS (`node tools/run-change-guard.js before`)。
- 示範：目前正式 HTML／CSS 與邀請函式，隔離虛構身分；LINE 原生選人步驟以清楚標示的原生剪輯圖解呈現，取消／回報／複製以測試替身驗證。QR、複製與分享內容保持相同推薦連結。
- guard after：PASS；教學單元測試 10/10、邀請流程測試 10/10；瀏覽器 320/390/768/1366px 全部通過（播放、聲音解碼、章節、清理、焦點、橫向分類與無預載媒體）。
- 成品：171 秒、720×1600、24fps、H.264/AAC；完整解碼 PASS，旁白平均 -22.5dB／峰值 -6.6dB；已逐一檢查輸出關鍵畫面。
- R2：新 key 上傳前 HEAD 404；上傳後長度 11350593、video/mp4、Range 206、完整下載 SHA256 `9cdf964123a367bba5b88a2c551bb4b02af5a7758a9ea814957162e2005a84da` 均相符。
- 原十三支 metadata SHA256 `128d3e8e3494120d173b96bc4321b09ae5c7659ced0301dc4180af9f2977495d` 維持不變；CSS v3 不变，教學 JS 升 v9。
- 上線判斷：測試通過，可部署；GitHub Pages CI 與正式檔案／教學入口驗證完成後另保存部署回執。
- 驗收界線：未測真人 LINE 登入／選人／聊天室收到訊息；影片明示選人為圖解、回報與剪貼簿為替身。正式資料異動、真實 LINE 傳送均 0。
- 部署：測試通過後依使用者常設授權發布版本化 R2 影片及 GitHub Pages；不部署 Worker。
