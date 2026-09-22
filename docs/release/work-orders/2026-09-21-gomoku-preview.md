# 喵喵五子棋預覽工作單

- 日期：2026-09-21；需求：參考貓咪遊戲可愛風做五子棋，使用者「繼續」；先完成可玩預覽。
- 起點/回復點：986d0fc；僅新增檔案，不修改正式遊戲入口、登入、會員、名片、點數、資料庫或 Worker；不部署。
- 已讀：feature-change-protocol、change-work-order-template、core-invariants、game-center；新增 gomoku-preview 契約。
- 修改前 `node tools/run-change-guard.js before` PASS。
- 預計：gomoku engine/controller/audio/AI worker、CSS、原創封面、preview server、測試、工單。只有工具測試清單可增添新測試。
- Imagegen 技能：內建生成原創橘貓/灰貓木棋盤插畫，奶油背景與柔和 3D 觸感，无文字/商標；生成檔案需複製至 assets/gomoku，不用外部授權圖片。
- 玩法：15×15 自由五子棋，黑先白後，五顆以上勝；三級電腦、選位確認、練習悔棋、提示、音效與背景音樂。
- 修改後 `node tools/run-change-guard.js after` PASS；10 項引擎/音訊/隔離單元測試 PASS，Playwright 手機觸控與鍵盤、AI、悔棋、重開/離開清理、320/390/844/1280 寬度無橫向溢出 PASS。所有瀏覽器請求限定本機/blob/data。
- 已檢視手機/桌面截圖並修正插畫比例、手機遊玩時收起介紹，以及切换/關閉音效造成的舊 Promise 誤報。
- 原創圖檔：assets/gomoku/cat-friends-v1.png；內建 image_gen 生成，最終完整提示詞記於 assets/gomoku/README.md。棋盤、棋子、音效和音樂由程式原創。
- 本機網址 http://127.0.0.1:8794/，啟動 `node tools/preview-gomoku.mjs`。僅本機完成、未提交部署；正式 LIFF 實機音訊、獎勵接線、後端驗證不在本階段驗收範圍。
