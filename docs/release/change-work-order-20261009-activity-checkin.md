# 活動／課程核銷修復與發布工作單

- 日期：2026-10-09；直接授權：「修正、測試、部署」。
- 來源：fangwl591021/LINE-；從 origin/main 4389eed365aeca2ff205aa2b42bfecee8b8716d0 建立 codex/activity-course-checkin-20261009，checkout .worktrees/veo-crm-tasks-release。保留原未追蹤驗收紀錄與其他 worktree，不帶入特約店家改動。
- 正式目標：GitHub Pages https://fangwl591021.github.io/LINE-/；Worker line-engine / account 8058cf61f0cd44c4edd78080b193033a；100% 現版 ca2c7622-ab0c-4df3-bc08-510b17a03957。
- 只允許：會員活動 QR 本機顯示、官方活動／課程專用掃碼器、單向冪等核銷、本場管理權限及原子寫入、手機名單刷新保留活動ID、必要測試／契約／快取版本。
- 預計檔案：workerbackup.js、js/config.js、js/modules/member-hosted-events.js、js/modules/home.js、js/modules/admin.js、js/modules/admin-activity-registration.js、新 shared activity-checkin.js、index.html、admin.html、核銷契約及測試。
- 禁止：登入／UID resolver／會員歸屬／名片／點數 ledger／NFC 贈點／活動公開與報名規則／AI模型／金鑰／綁定／正式批次資料。不新增資料表或 migration。診斷及驗收寫入僅合成、本機資料。
- 已讀：core-invariants、feature-change-protocol、liff-routes、member-hosted-events、admin-activity-registration、points-ledger、regression-matrix、deployment-runbook；補充 activity-checkin 契約後才修改功能。
- guard before：PASS，C:/Users/User/AppData/Local/Temp/activity-checkin-before-20261009.log。
- 技能：workers-best-practices 維持 token／本場管理權限與原子防重；wrangler 查證 CLI 4.149.0、正式 account／版本、部署 --keep-vars --strict 與本機 runtime 隔離。
- 驗證計畫：活動／課程會員 UI 報名→出示→真實像素解碼→相機串流→核銷→回看；官方 QR／手機與 admin 掃碼／舊 LIFF QR→單向核銷；跨場／跨店／取消／重送／並行／權限競態／錯誤回應／返回關閉；本機 Workers/D1 runtime，完整 before/after guard，發布前 dry-run，PR/CI、正式 Worker 版本與 Pages SHA256。
- 驗證結果：13 個新增核銷 SQL／安全契約 PASS；相關活動報名／可見性／梯次／會員活動回歸 104 項 PASS（其後增加一個父梯次競態測試）；瀏覽器兩類別、兩建立方式 11 組完整 QR 像素／相機串流／名單流程 PASS。完整 admin shell 新掃描器、表單／DM／公開流程及 320/390/1440px PASS。實際 worker-entry 在 local Workers/D1 上三種活動各 8 個並行掃碼 PASS。相機僅模擬串流，不代表實機 LINE 驗收。
- guard after：PASS（更新快取版本對應舊契約後）；新增核銷測試加入 full guard。發布前重跑最新版本。Wrangler dry-run --keep-vars --strict PASS；wrangler.toml 未修改，無 migration、正式資料寫入、點數／通知呼叫。
- 發布結果：待填。回退保留既有活動與報名，參考上述舊 Worker 與 origin/main；不還原 D1。
