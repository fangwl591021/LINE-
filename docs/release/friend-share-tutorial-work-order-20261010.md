# 分享好友操作教學工作單

- 日期：2026-10-10；需求：補做分享好友操作影片並上架教學區。
- 正確專案：LINE-；起點 `53eaead91abe5db38d8088e533d30f55eba29316`，正式 GitHub Pages `/LINE-/`。
- 範圍：新增 `friend-share` 影片與教學 metadata，放入會員與名片；保留四個橫向分類與原十三支影片。
- 檔案：tutorial-center.js、index.html 版本、教學契約／測試／本工作單、獨立教學錄製與剪輯腳本。
- 禁止：不改推薦歸屬、身分、CRM 分享程式、登入、點數、Worker、secrets；不對真人送 LINE 訊息。
- 已讀：core-invariants、feature-change-protocol、tutorial-center、liff-routes；LINE 推薦好友規則與實際邀請程式。
- guard before：PASS (`node tools/run-change-guard.js before`)。
- 示範：目前正式 HTML／CSS 與邀請函式，隔離虛構身分；LINE 原生選人步驟以清楚標示的原生剪輯圖解呈現，取消／回報／複製以測試替身驗證。QR、複製與分享內容保持相同推薦連結。
- guard after／媒體、瀏覽器與正式部署驗證：待完成。
- 部署：測試通過後依使用者常設授權發布版本化 R2 影片及 GitHub Pages；不部署 Worker。
