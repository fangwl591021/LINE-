# 坦克畫面與音效改善

- 起點：c6486df；使用者反映坦克場景單薄、沒有聲音，並授權提交部署。
- 範圍：Canvas 呈現、音效解鎖/音量/狀態、遊戲 CSS、前端快取版本、本機預覽及相關測試。
- 禁止：不改共用模擬引擎、遊戲難度、Worker、會員驗證、贈點、migration 或正式資料。
- 已讀：core-invariants、feature-change-protocol、regression-matrix、daily-tank-challenge。
- guard:before：PASS。
- 視覺皆為原創 Canvas 繪製；音效皆 Web Audio 合成，無外部素材。
- 音效目前低音量且僅開始時 resume；新增手勢重新恢復與狀態提示，不宣稱能覆寫裝置靜音。
- guard:after：PASS（完整回歸含 2 個新音訊測試）。
- 瀏覽器：PASS，6 種音效 OfflineAudioContext PCM 非靜音；實際 AudioContext 手勢啟用、被封鎖提示、鍵盤、雙指觸控、390×844 / 844×390 排版、重試/同日發獎回歸。
- Renderer JSON 前後比對不改模擬狀態；手機橫直向與桌面截圖已檢視。
- 本次沒有實體手機/LINE 喇叭實聽；音量或裝置靜音仍需用戶以「試聽音效」確認。
- 實際檔案：index.html、css/daily-tank.css、js/modules/{daily-tank-challenge.js,tank-audio.mjs,tank-renderer.mjs}、test/{tank-audio.test.mjs,browser/daily-tank.mjs}、tools/{preview-daily-tank.mjs,run-smoke-contracts.js}、daily-tank-challenge 契約與本工單。
- 部署：僅 Pages；不需更新 Worker 或資料庫。
