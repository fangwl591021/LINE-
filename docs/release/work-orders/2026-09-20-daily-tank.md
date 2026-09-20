# 每日坦克挑戰

- 需求：在既有簽到頁加入原創 Canvas 坦克遊戲，首次破關每日 100 點；使用者後續明確要求沿用簽到贈點服務，先完成遊戲。
- 基線：main / 585c263；工作目錄乾淨。guard:before PASS。
- 已讀：core-invariants、points-ledger、button-actions、regression-matrix、feature-change-protocol。
- 允許：新遊戲模組、樣式、每日任務卡、Worker 挑戰 actions、測試、挑戰 session migration、文件。
- 不改：既有簽到、收銀、會員歸屬、點數餘額算法、LINE 登入設定、正式資料與 secrets。
- 實際架構：共用點數在母站 wetw-point API；D1 point_awards 為子站發獎紀錄。不能跨 HTTP 與 D1 宣稱單一 ACID 交易。
- 決策：沿用 PointModule.insertUserPoint 與 gift_money；使用既有 point_awards 唯一鍵先保留發獎權，僅保留成功者送一次。模糊結果只能查證，不自動重送或改用本地餘額。
- 新 session 表只存遊戲 seed / 身分 / 日期，不是會員表或點數餘額表。前後端共用 deterministic engine，後端重播操作驗證勝利；不信任前端 kills/points。
- 領獎日以伺服器台北日為準，跨午夜必須重新開始；已送出的前日結果仍可查證。
- 初始部署限制：wrangler.toml 無 staging，因此先完成本機測試；使用者後續明確指示「部署」，授權發布正式環境。
- 驗證結果：新增 14 個 engine/API 測試全部通過；原專案完整 guard:before / guard:after 通過（目前 full runner 116 個檢查入口）。

## 功能與檔案

- `index.html`：簽到區新增「坦克守衛挑戰」，不更改原簽到按鈕與 action。
- `js/modules/tank-engine.mjs`：原創固定時間步遊戲、磚牆、生命、敵人、射擊、勝敗、重播驗證。
- `js/modules/daily-tank-challenge.js` / `css/daily-tank.css`：LIFF 內頁 dialog、鍵盤/多點觸控、手勢後 Web Audio、音效開關、重試與結果。
- `worker/daily-tank-challenge.mjs` / `workerbackup.js`：三個 token-auth actions、伺服器時間/金額/會員/租戶、發獎權保留、母站明細查證。
- `migrations/0043_daily_tank_sessions.sql`：只新增遊戲憑證表與會員時間索引。會員仍為 users，獎勵仍為 point_awards，點數明細仍由既有母站 API 寫入。
- `test/tank-engine.test.mjs` / `test/daily-tank-challenge.test.mjs` / `test/helpers/tank-player.mjs`：14 個單元與服務驗證。
- `test/daily-tank-runtime.mjs`：真實本機 workerd D1 migration 與 8 並行請求僅呼叫一次母站服務；母站服務為合成測試替身。
- `test/browser/daily-tank.mjs`：實際前端模組＋API handler＋SQLite＋合成母站；鍵盤、雙指搖桿同時射擊、橫直向、音效建構失敗、斷線不顯示假入帳、刷新後重送憑證、明細及同日完成狀態。
- `tools/run-smoke-contracts.js`：納入新增 engine/API 測試。
- `tools/preview-daily-tank.mjs`：僅綁定 127.0.0.1，記憶體資料庫與合成會員/母站，無正式 API 或金鑰。
- `docs/contracts/daily-tank-challenge.md` / `docs/contracts/points-ledger.md` / 本工單：契約與交付紀錄。

## 測試與預覽

- `node --test test/tank-engine.test.mjs test/daily-tank-challenge.test.mjs`：14/14 PASS。
- `node test/daily-tank-runtime.mjs`：PASS。
- `node test/browser/daily-tank.mjs`：PASS。
- `node tools/run-change-guard.js after`：PASS。
- `wrangler deploy --dry-run`：PASS，未部署。
- `git diff --check`：PASS。
- 本機預覽：http://127.0.0.1:8791/ 。啟動：`node tools/preview-daily-tank.mjs`。預覽 300 點起始值為合成資料，重新啟動服務會重置，與正式會員無關。
- 瀏覽器測試用固定 seed 與調整合成 session 時間加速，實際前端未加入作弊/跳關入口；發獎驗證使用同一引擎。
- 截圖已檢視：desktop、844×390 landscape、390×844 portrait；修正了直向射擊按鈕被壓窄。

## 身分與防重

- 沿用 SecurityModule 驗 LINE access token → D1 findUserByIdentity → 已持久化 point_line_id；不相信請求中的 pointUserId/points/date/tenantId。
- 使用既有唯一索引 user_id + card_id + award_type，card_id 加入伺服器 shopId/台北日期；award_id 本身亦為主鍵。
- 插入成功的單一請求才呼叫 PointModule.insertUserPoint；重送、刷新、多分頁及再次破關只查既有結果。
- 結果不確定時只查包含完整 challenge_id 的 +100 gift_money 明細；不以餘額差推斷、不插入本地備援、不排重送佇列。

## 尚待驗收／限制

- 沒有 staging 設定；經使用者後續授權部署正式環境，驗證不呼叫正式發點 API。
- 尚未在實體 iOS/Android LINE 內驗收，也未實際發放正式 100 點；手機已做 Chrome 多點觸控模擬測試。
- 現有母站 API 無已驗證的跨站原子交易／查冪等鍵協定；本版依使用者後續要求沿用原服務。不是「D1 + 母站」單一 ACID 交易。
- 伺服器若在保留發獎權後、HTTP 送出前中斷，或母站結果查不到，會停留待確認，需管理員人工對帳。這是避免重複發點的保守限制。
- 操作重播可擋未破關的簡單偽造，但不能防止自動玩家。Session 20 分鐘過期；遊戲最多 6 分鐘，跨台北午夜需重新開始。
- session 表尚未加自動清理；日後按實際使用量規劃保留期，這次不刪任何正式資料。

## 正式發布（2026-09-20）

- 使用者明確指示「部署」後執行；發布前再次通過 14/14 engine/API 測試及 diff check。
- 僅執行 0043_daily_tank_sessions.sql，2 個 DDL 查詢成功；沒有批次套用其他 migration，沒有更動會員或點數資料。
- Worker 使用 deploy --keep-vars 保留既有環境設定與金鑰，版本：4c30e3c4-fd75-4cd0-a291-04fbb73c0bd2。
- 前端透過既有 main → GitHub Pages 流程發布；正式頁面與靜態檔案將在發布後唯讀驗證。
