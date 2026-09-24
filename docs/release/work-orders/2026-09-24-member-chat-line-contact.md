# 私訊 LINE 加好友設定與通知文案

- 日期：2026-09-24
- 需求：私人 LINE 輸入用於讓聊天對方加好友；有人私訊時即使離開頁面，也由既有官方帳號通知。
- 起始／回復 commit：2136dd855a4b9b2ec80dd0dfa6a2aaf17d1caa2a
- 範圍：member-chat UI／POP、專屬 LINE 連結驗證、既有 preferences 新欄位與本人／對話讀寫、相關測試、快取版本。
- 禁止：不改 identity resolver、會員／名片歸屬、點數、通知收件 UID、佇列／排程／Webhook 或其他功能。不上傳真實會員測試訊息。
- 已讀：core-invariants、card-resolvers、points-ledger、liff-routes、button-actions、regression-matrix、feature-change-protocol；新增 member-chat-line-contact 契約。
- 修改前：node tools/run-change-guard.js before PASS。
- 預期檔案：worker/member-chat.mjs、js/modules/member-chat*.js、css/member-chat.css、exchange-zone loader、index.html、migration 0049、私訊相關 test 與此契約／工作單。
- Migration：僅新增 member_chat_preferences.line_contact_url，保留所有既有資料；僅選擇性執行 0049，不套用歷史 pending migrations。
- 部署：依使用者「以後修正好就直接部署」授權，測試通過後部署既有 line-engine 與 GitHub Pages，保留 vars／bindings／secrets。
- 修改後：node tools/run-change-guard.js after PASS（完整 smoke contracts）。
- 相關測試：node --test test/member-chat.test.mjs test/member-chat-ui.test.mjs，50/50 PASS。語法檢查、git diff --check、Wrangler deploy --dry-run --keep-vars PASS。
- Chrome 390px／桌面合成測試 PASS：POP 輸入、無效網址、儲存失敗及重試、重開保留／留白移除、對方加好友連結、未設定狀態、封鎖隔離、通知獨立、收件頁關閉後 mock push、取消通知後不再推送。原優惠券、名片 POP、配對分數與英文／業種搜尋仍通過。
- Workers／Wrangler 技能檢查：綁定參數 SQL、first-primary session、驗證後的本人／對話權限、no-store 與無個資 log；新版 API 不碰推播收件人。型別版本 5.20260924.1，Wrangler 4.102.0，部署保留既有 vars／bindings／crons。
- 發布前確認：origin/main 仍為起始 commit；正式 Worker d9110aef-f2c8-4706-827b-05301fda44f5；D1 尚無新欄位、0046–0048 已記錄，歷史 0042／0043 未套用且不碰。
- 限制：LINE ID／分享連結由本人填寫，無法代為確認帳號歸屬或加好友；手機實際橫幅仍依 LINE／裝置通知及勿擾設定。本次不以真實帳號傳測試訊息；瀏覽器與 mock push 不等於手機實機驗收。
- 發布結果於 PR 留下 migration／Worker／Pages／線上資產驗證證據；程式可回退，新增空白欄位保留，不刪除資料。
