# 會員私訊 LINE 背景通知

- 起始 commit：bd86e1c；分支 codex/member-chat-notifications。
- 使用者要求離開頁面後手機仍收到通知，沿用修正完成直接部署指示。
- 範圍：私訊通知設定、D1 outbox、獨立每分鐘排程、通知返回對話路由及測試。
- 禁止：修改 users／身分連結／名片／點數／舊 inbox、既有 OA 關鍵字及既有排程行為；不代會員傳送測試私訊或正式 LINE 通知。
- 已讀：feature-change-protocol、core-invariants、card-ownership-and-versioning、regression-matrix、liff-routes、原 member-private-chat 工作單。
- guard before：PASS。
- guard after：PASS（完整 smoke contracts；保留原 auth 版本契約，使用 chat=1 獨立 cache-buster）。
- 預計檔案：worker/member-chat*.mjs、worker-entry.mjs、wrangler.toml、migrations/0047_member_chat_notifications.sql、js/modules/member-chat*.js、exchange-zone.js、js/auth.js 的單一路由掛載、index.html cache version、chat 測試與 guard 清單。

## 通知契約（明確擴充第一版禁止推播的範圍）

1. 會員自行勾選 LINE 私訊通知，預設關閉；沿用 bearer LINE profile 驗證，再以既有 OA token 查核當次登入 UID 能被 OA 識別。只能儲存後端驗證的 UID，禁止使用 point_line_id 或前端提供收件人。
2. 僅通知開啟後新收到的私訊。訊息與 outbox 由同一 SQLite INSERT trigger 原子建立，不補推歷史訊息。訊息重送不產生第二通知。
3. 30 秒緩衝，每分鐘獨立 cron 處理。已讀、封鎖、關閉通知、身分不再對應及未開放交流時不推播。網頁關閉不影響排程。
4. 同對話／收件人每個固定 5 分鐘時段最多一則通知，內容固定為「您有新的會員私訊」，不包含姓名、電話、私訊本文。提醒內提供 LIFF 返回對話按鈕；URL 只有不透明對話 ID，不授權任何資料存取。
5. SQL 條件更新取得 lease；LINE 首次與重試都使用同一個 X-Line-Retry-Key 與相同 payload。僅暫時性失敗重試，最多 5 次且在 24 小時內；200／已接受的 409 完成，不宣稱裝置已顯示。
6. 新 cron 僅處理私訊，不能落入既有簽到／分析排程。每批最多 10 件；7 天後僅清理通知工作 metadata，不刪私訊。
7. 通知失敗不能讓已儲存私訊變成傳送失敗。無新的服務、金鑰或會員系統；現有 vars/secrets/bindings 保留。
8. LINE 推播使用 OA 額度；會員須加好友且未封鎖，裝置／LINE 通知設定仍會影響是否彈出。需實機確認，不拿本機 mock 宣稱真機通知成功。

## 部署及回退

- 僅套用 0047 additive migration，保留既有正式資料；先後端再 Pages。
- 原 Worker b44dc7e1-5522-4368-ba96-d375d1d05999；原 Pages bd86e1c。
- 回退程式及新增 cron，保留通知表，不還原全庫或刪聊天資料。

## 驗證結果

- 後端 SQLite／前端 client、通知與路由共 33 項通過，原有私訊與身分安全案例保留。
- Headless Chrome 390px／桌面通過原私訊操作，新增勾選通知、收件人關閉頁面後 mock cron 推播、深連結回原對話、持久化關閉通知測試。
- 確認 outbox 與私訊原子寫入，已讀／封鎖／停用／名片失效／身分衝突不推播；並行 lease、timeout 及 completion 寫入失敗用相同 LINE retry key，4xx 停止、暫時失敗最多 5 次。
- node 語法檢查、git diff --check、Wrangler deploy --dry-run --keep-vars 通過。既有 LINE_CHANNEL_ACCESS_TOKEN 存在，不建立或修改 secrets。
- Wrangler 本機 D1 migration 通過；trigger 使用 iif 避免 Wrangler SQL splitter 對巢狀 CASE END 的誤切割。真實既有 initial-params reader 的 LIFF state 與 OAuth callback 路由也已測試。
- 正式 D1 只讀確認 0046 已套用、0047 尚未套用；既有五張 chat 表存在。尚未以正式會員實發 LINE 通知。
- 依 Workers 技能採 D1 持久工作、獨立 cron 與 waitUntil；不依賴手機頁面繼續執行。前端提示時間為正常低負载約 30–90 秒，LINE/裝置/排程延遲仍可能影響。
