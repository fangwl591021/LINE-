# 交流名冊排除未命名帳號

- 日期：2026-10-27；起始 commit：adbf0b2390e1d4b170341f5061dafa1270265d32。
- 需求：使用者在交流遇到「未命名」，要求此類帳號不要進入交流名單。
- 範圍：找會員、人脈島公開名冊及只讀參觀名冊，使用相同有效顯示姓名規則；分頁／排序／配對前排除。姓名是空白或系統佔位名稱時不得成為新聯絡對象；補正後重新出現。公開動態同樣排除目前顯示姓名無效的作者，自己的貼文管理保留。
- 以目前有效本人名片為準，保留原姓名→英文名→會員名稱的空值 fallback；「未命名」佔位名稱不當作空值偷偷改用其他身分。公開名冊另檢查實際公開版本姓名，不用私人姓名補公開版。
- 允許檔案：worker/member-chat.mjs、worker/member-display-name.mjs、worker/exchange-zone.mjs、test/member-chat.test.mjs、test/island-entry.test.mjs、test/member-display-feed.test.mjs、相關契約、風險地圖及本工作單。
- 禁止：刪除會員／名片／歷史對話／貼文、改 UID／歸屬、點數、LINE 回覆、AI 審核與註冊權限、schema、bindings、vars/secrets、排程。歷史對話閱讀與封鎖管理保持可用。
- 已讀：AGENTS.md、core-invariants、people-island-onboarding、member-chat-discovery 工作單、feature-change-protocol、line-release-verification、workers-best-practices、wrangler。
- guard before：PASS（../unnamed-network-before.log）。
- guard after：PASS（../unnamed-network-after.log）。
- 功能驗證：真 SQLite handler 測試94項通過（member-chat＋island-entry 91項、公開動態3項），包含姓名佔位、英文／LINE fallback、公開版本、最新版本、舊 handle、各排序與分頁、補正恢復、歷史閱讀及無資料寫入。另在新對話 INSERT 前變更姓名，原子條件確實阻擋，沒有建立對話或訊息。
- 同步舊契約檢查：公開貼文本體仍不依賴會員欄位，但依本次核准規則額外使用作者姓名資格過濾；原「整段不能FROM users」靜態檢查改為本體隔離及四條public list/get分支均含有效姓名條件。
- 上線前設定核對：line-engine、ACTMASTER_DB actmaster_db、原KV／R2綁定及三個排程不變；不套用migration，沒有正式訊息或會員資料測試寫入。
- 發布：測試通過後直接發布 Worker；不修改前端、不需 migration。提交／PR 後核對 main CI 與正式 Worker 設定、版本及未登入拒絕結果。
