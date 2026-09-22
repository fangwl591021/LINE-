# 喵喵五子棋：遊戲館整合

- 需求：延續可愛風五子棋，接入現有 LINE 遊戲館；本次先完成本機測試，不部署。
- 起始 commit：986d0fc662d2bd6c3fd55107005212d0f11e37de。
- 既有未提交五子棋預覽與素材屬前一階段，保留並整合。
- 變更：五子棋引擎重播驗證、挑戰/練習 UI、遊戲館第三入口、後端遊戲白名單/明細名稱、隔離預覽與測試。
- 不變：LINE 登入/UID resolver、會員資料、每日簽到、母站點數服務、既有領獎唯一鍵、坦克與方塊規則、正式設定及資料。
- 讀取契約：feature-change-protocol、core-invariants、points-ledger、liff-routes、game-center、gomoku-preview。
- guard before：2026-09-22 `node tools/run-change-guard.js before` PASS。
- guard after：2026-09-22 `node tools/run-change-guard.js after` PASS（完整 smoke contracts）。
- 資料庫：沿用 0043/0044 的 daily_tank_sessions、game_play_events 與 point_awards；不需 migration。
- 驗證：棋局合法重播、既有身分驗證與每日共用上限、重試/並行、練習隔離、手機/桌面 UI。
- 上線結論：僅本機，尚未部署、未操作正式點數。

## 結果與檔案

- 前端：`index.html`（game-center v2）、`js/modules/game-center.mjs`、`css/game-center.css`、`js/modules/gomoku-{engine,controller,ai-worker,audio}.mjs`、`css/gomoku.css`、既有原創 `assets/gomoku/`。
- 後端：`worker/game-center.mjs`（明確選用驗證器）、`worker/game-session.mjs`（第三款白名單）、`worker/game-reward.mjs`（只擴充明細名稱；預約、發點、查回執不變）。
- 測試：`test/gomoku.test.mjs`、`test/gomoku-integration.test.mjs`、`test/helpers/gomoku-player.mjs`、`test/game-center.test.mjs`、`test/browser/{gomoku,gomoku-integration,game-center}.mjs`、`tools/run-smoke-contracts.js`。
- 本機：`tools/preview-gomoku.mjs`（保留純練習）、`tools/preview-game-center.mjs`（三款整合）；契約 `game-center.md`、`gomoku-preview.md`、`points-ledger.md`。

## 測試證據

- `node --test test/gomoku-integration.test.mjs test/gomoku.test.mjs test/game-center.test.mjs`：26/26 PASS。
- `node test/browser/gomoku.mjs`：觸控、確認落子、三難度、AI、提示、悔棋、重開、過期回覆取消、鍵盤、音訊開關、四尺寸、清理 PASS。
- `node test/browser/game-center.mjs`：既有坦克/方塊共領 100、失敗/重試/重新整理、五尺寸及第三張卡片 PASS。
- `node test/browser/gomoku-integration.mjs`：自由練習不建立 session、合法勝局、入帳後回應斷線、重整確認不重發、同日再勝、重开建立新 session、帳號切換防護、手機/橫向/桌面、巢狀 Escape、清理 PASS。
- 完整 before/after guard 均 PASS，`git diff --check` PASS。
- 依 `workers-best-practices` 技能核對 D1 session/batch 與 Web Crypto；目前最新 Workers types 5.20260921.1 與本機參考一致。依 `wrangler` 技能完成 Wrangler 4.136.1 `deploy --dry-run` PASS，1229.54 KiB / gzip 267.42 KiB；僅打包至暫存目錄，沒有上傳。
- 整合預覽：`http://127.0.0.1:8795/`，loopback SQLite 記憶體 DB、合成身分與模擬母站服務。全部瀏覽器請求限 loopback/blob/data，未發送正式點數。

## 仍需注意

- 尚未部署，未做真實手機 LINE LIFF 登入、音訊/靜音模式實測；桌面 Chrome 手機尺寸不是實機驗收。
- 沿用遊戲館既有 20 分鐘 session 與台灣跨日限制；較長棋局逾時需重新挑戰。
- 合法重播驗證不是反自動化保證，不能阻止自動棋手；本機對手也不保證專業棋力。
- 母站點數服務與本地 D1 不具跨系統原子交易；沿用唯一預約與母站精確 marker 對帳，模糊結果不自動重送。
