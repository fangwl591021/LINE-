# 首頁直接展示會員活動

- 需求：已發布會員活動不應藏在入口內，直接顯示於首頁近期活動，沿用所有登入平台會員可見。
- 起點：LINE- main 9eb65ef35e9dbc79f09ab8f066229224f131376a；codex/home-member-event-cards；正式 Worker line-engine 不改。
- 只改：首頁既有卡片網格加入獨立會員活動投影、分類、受保護 DM 縮圖及明細／分享／報名入口；首頁載入和發布／編輯／取消後更新；測試、版本號與合約。
- 禁止：不把會員活動寫成官方 activities，不變更資料庫、Worker、認證／會員 resolver、公開權限、點數、梯次、報名／QR、金鑰、原官方活動網路篩選。
- 預計檔案：js/modules/home.js、js/modules/member-hosted-events.js、css/member-hosted-events.css、index.html、相關前端測試、tools/run-smoke-contracts.js、docs/contracts/member-hosted-events.md、docs/contracts/home-activities-loading.md。
- 已讀：上述兩合約、core-invariants、feature-change-protocol、change-work-order-template；Workers best-practices／runtime-patterns 技能核對現有後端權限，不改 Worker。
- before：完整 guard PASS（home-member-events-guard-before.log）。
- after：完整 guard PASS（home-member-events-guard-after.log）；39 個首頁、載入、會員活動 UI／API／附件 focused tests PASS。舊測試僅調整 home.js 版本號，不放寬既有斷言。
- 驗證：首頁不用另點入口即見卡片；會員及官方分類共存但資料／報名動作不混用；未登入不讀／顯示；切帳號、token更換、離頁舊回應不得覆蓋；載入失敗可重試；縮圖採現有 token + blob、離頁清理；取消／過期排除；提交後刷新，不自動報名；320/390/PC實際DOM和視覺核對，實機另驗。
- 發布：僅 GitHub Pages，完整 guard 和 PR CI PASS後合併，確認實際線上 HTML/JS/CSS bytes。不修改正式會員活動內容做驗收。
- 瀏覽器：本機實際首頁近期活動 DOM、home.js 函式與會員活動模組，接真實 handler 的記憶體 fixture；320／390／620 px 容器無水平溢出（不是實機／手機 viewport）。官方與會員卡片同時顯示、課程分類篩選、離頁清除及返回載入、詳細／完整 DM／首頁報名入口均通過；首頁報名只開明細，fixture registrations 維持 0。縮圖預留固定高度，避免圖片載入造成按鈕跳位。驗收圖 home-member-events-preview.jpg 為虛構活動，沒有新增或修改正式資料。
- 回復：Pages 回到 9eb65ef35e9dbc79f09ab8f066229224f131376a；Worker c149dfd8-e98e-40f9-a7e1-d3b4e9ffbadc 不更動，無 migration／資料回復。
