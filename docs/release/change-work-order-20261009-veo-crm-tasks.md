# VEO 待辦任務補齊

- 日期：2026-10-09；需求：「LINE-缺少VEO的代辦任務，移植沒有完全」。
- 正確 checkout：LINE- origin，`.worktrees/activity-visibility`；起點 7c8cc774064815919fd31966f28f543786f3e289，目前 branch codex/contract-popular-stores-20261009。
- 同工作樹既有特約／熱門店家修改保留，不屬本次改動；不修改 VEO 的 dirty checkout。
- 查證：VEO AI 名片 CRM 處理成功會呼叫 ensureContactFirstTask，寫入 ai_tasks；LINE- 上次移植僅手動／AI 下一步任務，沒有 CRM 首次任務串接，清單也只有簡短入口。
- 只允許：上述契約的 CRM 首次任務橋接、舊資料明確確認補建、完整待辦卡與安全本人手動提醒。
- 預計檔案：worker/ai-advance.mjs、workerbackup.js 的獨立保存後 hook、js/modules/ai-advance.js、css/ai-advance.css、index.html 快取版本、0061 migration、AI 任務測試及隔離驗收 fixture。
- 禁止：VEO 資料／部署、會員歸屬／登入／點數／行事曆／現有私訊流程、secret/binding、批次修改正式資料；目前未授權部署。
- 已讀：core-invariants、feature-change-protocol、card-resolvers、ai-card-folder、card-ownership-and-versioning、liff-routes、points-ledger、regression-matrix，及新 ai-advance-crm-tasks 契約。
- guard before：PASS（C:/Users/User/AppData/Local/Temp/veo-tasks-before.log）。
- guard after：PASS（C:/Users/User/AppData/Local/Temp/veo-tasks-after.log）。初次完整測試發現 SecurityModule 被隔離抽取時不能引用頂層 Symbol；改為模組內私有 Symbol，只標記原來已通過驗證的 saveCard/updateCard，保持原權限判斷，再跑完整 guard 通過。
- focused：22/22 PASS（C:/Users/User/AppData/Local/Temp/veo-tasks-targeted.log）；真實 card-save 模組＋本機 SQLite 驗證首次 CRM hook、UID-only fallback 不觸發及 hook 失敗不影響原存檔／點數流程。
- regression：79/79 PASS（C:/Users/User/AppData/Local/Temp/veo-tasks-regression.log），包含名片配對、reward-only 邊界及 AI 任務。
- browser：320/390/768/1200px 全部 PASS（C:/Users/User/AppData/Local/Temp/veo-tasks-browser.log）。實際 JS/CSS 與 handler、隔離 SQLite、合成 10 張名片；驗證未勾選不建立、CRM 去重、紀錄／延期／完成／不復活、本人提醒開關與取消確認、關閉及初始失敗重試、沒有橫向溢出。使用既有 bundled Playwright：NODE_PATH=C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules；非專案新增套件。
- runtime：Wrangler 4.120.0 --local + test/fixtures/ai-advance-runtime.wrangler.toml，僅使用 fixture D1 11111111-1111-4111-8111-111111111111。驗證真实 Workers/D1 session/batch、並行建立／回報／CRM 補建去重、AI 確認、提醒；最終版再驗新合成名片的並行 CRM 與未到期手動提醒（C:/Users/User/AppData/Local/Temp/veo-tasks-runtime.log）。AI／LINE provider 都是 stub，未發真實訊息、未證明手機收到。
- 邊界：300 筆容量、名片移轉／CRM 關閉與原子寫入競態、跨會員拒絕、身分異動取消未送提醒、每日 10 筆手動上限、共用到期重試 key、原始私人資料不出現在提醒。
- 使用 Workers best practices 保持原身分與資料邊界；Wrangler 僅用本機隔離測試，不變更 package、binding、secret 或正式 D1。
- 外部文檔：[LINE Messaging API](https://developers.line.biz/en/reference/messaging-api/) 重試規格；[D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) 交易原子性。沿用原 Worker 設定與既有金鑰，不新增 AI 請求。
- 部署：未執行；正式資料未變動。上線需先套用 0061，再發布 Worker 和首頁 JS/CSS；不得混入未授權內容。

## 2026-10-09 本次正式發布授權

- 使用者在前次完工回報後要求「部署」；只發布 CRM 待辦，不併入特約／熱門店家。
- 發布 checkout：D:/OneDrive/文件/ChatGPT/Smart-Menu-Studio/.worktrees/veo-crm-tasks-release；branch codex/veo-crm-tasks-release-20261009；源自最新 origin/main 7c8cc774。
- 整理發布內容前獨立 guard before：PASS（C:/Users/User/AppData/Local/Temp/veo-tasks-release-before.log）。原 activity-visibility 工作樹與未授權特約修改完整保留。
- 已查證 Worker line-engine，Cloudflare account 8058cf61f0cd44c4edd78080b193033a；當前 100% 版本 cc7f6a0a-dacd-4d57-8f0d-f6701f7225ac。
- 正式 D1 actmaster_db / 8a0107f9-000d-4810-b6bf-5d599b699195；0054 已套用、0061 尚未套用、CRM 欄位完整。本次只增加 manual_requested 欄位及登記 0061，不批次套用 migrations，不補建正式會員任務。
- GitHub Pages 已確認 https://fangwl591021.github.io/LINE-/，main 根目錄來源；發布走既有 PR/Contract Guard/Deploy GitHub Pages。
- Worker 使用既有 Wrangler CLI 與 deploy --keep-vars --strict；保留目前 compatibility_date、cron、bindings、vars 和 secrets，不開新 AI 金鑰或服務、不對會員發送測試提醒。
- 回退：上述舊 Worker 版本与 Pages 7c8cc774 為參考。0061 屬新增欄位，回退保留該欄位與新任務資料，不還原整個 D1。
- 整理後 guard after：PASS（C:/Users/User/AppData/Local/Temp/veo-tasks-release-after.log）；名片／reward-only／AI 回歸 79/79 PASS（veo-tasks-release-targeted.log）；320/390/768/1200px 瀏覽器全部 PASS（veo-tasks-release-browser.log）；Wrangler deploy --dry-run --keep-vars --strict PASS（veo-tasks-release-dryrun.log）；語法與 git diff --check PASS。
- PR/CI、migration、正式 Worker 與 Pages 資產雜湊驗收：進行中；發布結果另記錄，不能以 push/dry-run 宣稱上線。
