# 活動卡片梯次選擇入口修正

## 變更摘要與範圍

- 日期：2026-10-09；需求：有梯次活動須先進詳細頁勾選，不從首頁直接報名或顯示「請先完成梯次載入」。
- 正確 checkout：LINE- `.worktrees/veo-crm-tasks-release`，branch `codex/activity-batch-entry-20261009`。
- 起始 / 回復 commit：`43dd5aaa2c044919b6fa0e699be286cead00553a`。
- 預計檔案：`js/modules/home.js`、`index.html`、活動入口單元 / 瀏覽器測試、快取版本契約、full guard 清單、本工作單與 `docs/contracts/activity-form-options.md`。
- 只改首頁梯次 CTA 與報名入口防呆；單場活動沿用「報名」，詳細頁沿用勾選後「我要報名」。
- 禁止：Worker、資料庫、正式資料、權限 / 公開歸屬規則、UID / 推薦人、點數、收費 / 名額、核銷、LINE OA / 金鑰、會員活動入口。
- 本次是否部署：是；2026-10-09 使用者在本機修正驗證完成後明確要求「部署」。僅發布 GitHub Pages，Worker / 資料庫不部署。

## 已讀規格與不變規則

- `docs/release/feature-change-protocol.md`、`docs/release/change-work-order-template.md`。
- `docs/rules/core-invariants.md`、`docs/contracts/liff-routes.md`、`docs/contracts/activity-form-options.md`、`docs/contracts/button-actions.md`。
- 開啟詳細頁只讀取，不自動報名；報名沿用 root activity ID、歸屬 network 與既有會員驗證；選項仍由伺服器驗證價格、名額。
- 已下架梯次不可勾選；選項未載入 / 未選取不送出。隱藏的舊詳細頁選項不可被首頁報名入口採用。

## 修改前檢查

- `npm.cmd run guard:before`：PASS；完整 smoke contracts 通過。
- 日誌：`C:/Users/User/AppData/Local/Temp/activity-batch-entry-before-20261009.log`。

## 實作與驗證（完成後填寫）

- 首頁多梯次「選擇梯次」→ 詳細頁勾選 → 明確按「我要報名」。
- 舊呼叫直接進 `joinPublicActivity` 時先導入詳細頁，不觸發會員 / 報名 API。
- `node --test test/activity-batch-entry.test.mjs test/activity-signup-context.test.mjs`：13 tests PASS；其中新增 8 項入口防呆測試，既有 5 項會員 / 歸屬測試改用真實梯次選擇模組。
- `npm.cmd run guard:after`：完整 smoke contracts PASS。首輪因既有會員測試只 stub `selection` 而缺少 `isSeries` 失敗；補齊真實選擇模組與當前詳細頁 fixture 後通過，未放寬任何驗證。
- `node test/browser/activity-entry.mjs`：PASS；使用真實 index/auth/navigation/home/selector，僅以合成 LIFF / API 回應取代正式帳號與資料。首頁 → 詳細頁 → 勾選兩梯次 → 明確報名成功；僅開頁沒有寫入。
- 同一瀏覽器涵蓋：慢速載入期間禁止報名、未勾選禁止報名、舊首頁呼叫不可採用隱藏勾選、失敗重新讀取、下架梯次不出現、報名 root ID / 歸屬維持。
- 320 / 390 / 1440 寬度 PASS；「選擇 / 梯次」固定兩行，不截字；詳細頁保留全圖與勾選說明。
- 瀏覽器 fixture 同步已部署的本機 QR renderer，解碼實際顯示的 QR 像素驗證原有報名紀錄仍可用；未修改 QR 功能。
- 日誌：`C:/Users/User/AppData/Local/Temp/activity-batch-entry-after-20261009.log`；畫面：`C:/Users/User/AppData/Local/Temp/activity-batch-entry-20261009/`。
- `node --check js/modules/home.js` / `git diff --check`：PASS。
- 正式網站 / 實體 LINE 裝置：未部署、未驗證。

## 部署續行（使用者授權後）

- 2026-10-09 再次 fetch 確認 origin/main 仍為起始 `43dd5aa`，未納入其他任務。
- `npm.cmd run guard:before`：發布前完整 guard 再次 PASS；日誌 `C:/Users/User/AppData/Local/Temp/activity-batch-deploy-before-20261009.log`。
- 瀏覽器增加 `--live-assets`：正式 index 與白名單 JS 從線上讀取，其餘頁面 / 模組、LIFF 與 API 仍全部攔截成合成 fixture；不呼叫正式可寫 API。部署後執行，結果另附收據。
- GitHub Pages 發布 → main guard → 實際資產雜湊 → 正式資產瀏覽器驗收；任何失敗不聲稱已完成。

## 完成結論

- 本機完成，使用者已授權發布；只有首頁腳本 / script cache 版本的功能變更，Worker 與正式資料不變。正式上線結果另附發布收據，不以推送成功代替正式驗證。
- 實際檔案：本工作單、`docs/contracts/activity-form-options.md`、`js/modules/home.js`、`index.html`、`test/activity-batch-entry.test.mjs`、`test/activity-signup-context.test.mjs`、`test/browser/activity-entry.mjs`、`test/activity-registration-history.test.mjs`、`test/member-hosted-events-ui.test.mjs`、`tools/check-ai-match-interest-contract.js`、`tools/run-smoke-contracts.js`。
- 已保留原有未追蹤的核銷 / 舊部署紀錄；未修改其他 checkout。
