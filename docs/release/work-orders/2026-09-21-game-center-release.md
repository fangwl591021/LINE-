# LINE 遊戲館 Phase 3–5 與發布

- 使用者最新授權「直接做到部署」，取代先前不得正式部署限制；仍在 feat/game-center-block-supply 開發，不直接編輯 main。
- 起點 3ad7e5c，乾淨工作樹。guard before PASS。
- 已讀：核心不變規則、點數/坦克/方塊/LIFF 契約、工作單/發版流程，以及 Cloudflare D1/Workers/Wrangler 技能與最新官方 D1 文件。
- 範圍：遊戲館、方塊正式 session 接線、坦克薄整合、既有 session 表擴充、共用每日領獎、安全/回歸/瀏覽器測試、migration 與發布。
- 不改：會員 UID 映射、簽到 10 點、店家收銀、其他點數來源、既有餘額；不清除任何正式資料。
- 預計檔案：worker/game-*.mjs、worker/daily-tank-challenge.mjs、workerbackup.js、migrations/0044_game_center.sql、js/modules/game-*.mjs、block-supply-controller.mjs、daily-tank-challenge.js、tank-engine.mjs、store-shop.js、index.html、css/game-center.css、遊戲測試/預覽/契約。
- Phase 3：遊戲館兩卡、入口與狀態 UI；Phase 4：同日共用鎖、驗證重播、成績/事件；Phase 5：完整 guard、跨遊戲競爭/逾時與五尺寸、坦克回歸、部署前檢查。
- 正式發布前先核對遠端版本、D1 schema、Pages 發布方式；保留 Worker vars/secrets，僅套本次 migration。
- 已知外部限制：母站沒有已驗證的交易冪等接口，D1 與母站不可成為單一交易；沿用一次送出、模糊結果僅查帳，不能宣稱跨站 exactly-once。
- 測試：guard before / after 全套 smoke contracts PASS；方塊引擎 13、音效 2、遊戲館後端 9、既有坦克 API 10、坦克引擎 6 項皆 PASS。
- 實際本機 workerd/D1：0044 migration 成功；坦克與方塊交錯 8 個完成請求，只呼叫一次母站替身、保存兩款成績。
- 瀏覽器：block-supply、daily-tank、game-center 三套 PASS；五尺寸 390×844、393×852、430×932、844×390、1366×768。包含鍵盤、觸控、暫停/返回清理、斷線後刷新重新確認、方塊先領後坦克不再領、失敗重新挑戰；沒有 browser pageerror。
- 截圖位於本機 TEMP：game-center-lobby-mobile.png、game-center-block-welcome.png、game-center-claimed-100.png、game-center-block-fail.png、game-center-both-completed.png、game-center-tank-running.png、game-center-tank-practice-result.png，以及 block-supply 各階段截圖。未使用真實會員入帳測試；手機 LINE/Safari 音訊仍需實機驗收。
- git diff --check PASS；Wrangler dry-run PASS（Worker 1214.07 KiB / gzip 263.12 KiB），綁定及 vars 保留。
- 發布目標核對：line-engine / actmaster_db (8a0107f9-000d-4810-b6bf-5d599b699195)；GitHub Pages 使用 main 根目錄。發布前遠端 D1 尚未有 0044 欄位與 game_play_events。
- 發布方式：feature commit → PR → 僅執行 0044 → Worker --keep-vars → 合併 PR → Pages → 唯讀健康、未登入拒絕、正式資產雜湊核对。部署 ID 與實際結果由發布後報告補列。
