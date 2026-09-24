# 會員私訊最小版

- 起始 commit：da5684c；分支：codex/member-private-chat。
- 需求：交流專區新增「我的聊天／找會員」，已註冊且有本人名片者一對一文字交流。
- 允許：新增獨立 member-chat Worker、前端、CSS、migration、測試；既有 Worker 入口及交流專區僅加掛入口與 lazy import。
- 禁止：會員／名片歸屬寫入、點數、商城、遊戲、原收件匣、全站監控、既有公開宣傳與刊登收費、LINE 推播；正式環境僅准私訊 additive migration，不替會員發送訊息。
- 已讀：core-invariants、card-ownership-and-versioning、regression-matrix、feature-change-protocol。
- guard:before：PASS（2026-09-24）。
- guard:after：PASS（2026-09-24），最後微調後再次通過。
- 2026-09-24 使用者另行明確授權「部署」：提交此隔離工作樹，僅套用私訊 migration，上線 line-engine 與 GitHub Pages。

## 私訊合約

1. 沿用 LINE access token 向 LINE profile 驗證、users 與 user_identity_links。拒絕前端 UID／role 作身分證明；衝突身分拒絕。
2. 2026-09-24 後續依使用者指定修訂：既有 LINE 會員須有有效 self_profile 本人名片即可找會員／私訊，不再要求電話補齊、public、pool_eligible 或 ai_review_status=passed；可關閉新聯絡。收藏名片絕不變成會員，且不變更名片公開與配對資格。詳見同日 member-chat-discovery 工作單。
3. 同一 LINE 平台內不同推薦歸屬網仍可透過公開名片交流；network_id 是既有推薦歸屬，不拿來新增租戶或更改會員。新表不連接其他平台資料庫。
4. 私訊存獨立 member_chat_* 表，所有對話／訊息操作都要求當事人；admin 無特權讀取。舊 inbox／管理監控不會讀到新表。不是端對端加密。
5. 一對會員僅一個對話；每位發送者＋client_id 唯一，重試相同內容回傳同筆，改內容重用鍵拒絕。
6. 僅純文字／Emoji，最多 2000 字。單頁 30 筆、keyset 分頁；關閉／背景停止輪詢，變更帳號清空畫面，不寫聊天到 localStorage。
7. 支援已讀、封鎖／解除、停止新聯絡、檢舉指定收到訊息；只有檢舉資料可供日後另行授權的處理流程，不提供全站私訊瀏覽。
8. 不觸發點數、優惠券、LINE 推播；保留原公開宣傳。第一版是開啟時增量更新，不承諾背景通知。
9. migration 僅新增私訊表／索引，不改既有會員、名片、點數表。缺 migration 明確失敗，不在請求內自動建表。

## 驗證

- 新增後端真 SQLite 10 項＋前端 client/合約 5 項，全部通過；納入既有 full guard。
- Headless Chrome 使用本機 handler 與記憶體 SQLite，合成 A/B/C 帳號通過：雙向對話、第三人無紀錄、讀取游標／訊息順序、回應遺失重試、封鎖／解除、背景及關閉零輪詢、帳號變更清除、390px 手機與 1440px 桌面。
- 加驗：會員資格讀取尚未完成就切換「找會員」，依目前分頁完成初始化，不會卡在空畫面。
- `git diff --check`、兩個新增執行模組語法檢查通過。
- 本機預覽：`node test/browser/member-chat-preview.mjs` → http://127.0.0.1:8804/ 。只有合成資料；重啟清空。
- Migration `0046_member_private_chat.sql` 新增 preferences/threads/messages/blocks/reports 五表；正式 D1 已只讀確認相依欄位完整、此 migration 尚未套用。
- 限制：尚未實機 LINE WebView 測試；以姓名首字作頭像、純文字/Emoji、無附件或 LINE 推播；檢舉先留存供後續人工處理，沒有新增管理後台。既有歷史站內信不搬移。
- 已獲上線授權：僅執行此一 additive migration，登記 d1_migrations，再部署 Worker 與 Pages；不套用其他 migration。
- 本次依 Cloudflare/Workers 指引使用 D1 綁定、參數化查詢、first-primary session、請求內容上限與不記錄私訊的錯誤處理；未增加平台服務或修改 bindings。

## 部署前核對

- 正式庫：actmaster_db / 8a0107f9-000d-4810-b6bf-5d599b699195，綁定 ACTMASTER_DB 不變。
- Worker：line-engine；前端：https://fangwl591021.github.io/LINE-/ ，main 根目錄由既有 Pages workflow 發布。
- 原 Worker 版本：2f96a397-8f1b-4e73-98c0-271c6ff9e279。
- 部署前 D1 bookmark：000010f3-00000000-000050f0-78a5af32989730f221cb501bde9d66d2（僅記錄，不執行全庫還原）。
- 2026-09-24 再跑 guard:after 與 Wrangler deploy --dry-run --keep-vars 均通過；遠端 main 仍為 da5684c，無分支漂移。
- 上線保留既有 vars/secrets/bindings；先後端後前端。完成後核對 Pages 資產雜湊與未登入 API 拒絕結果，實際版本由部署回報記錄。
- 回退優先還原 Worker 與前端程式；保留 additive 私訊表及已產生訊息，不刪表、不回復整個會員資料庫。
