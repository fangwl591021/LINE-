# 私訊使用 LINE 登入身分，不使用點數別名

## 範圍與授權

- 起始版本：2ce22c4；原 Worker：2d90f7b6-0ae2-47d2-bda7-dbf780aa52af。
- 使用者指出私訊應使用每次登入的 login；已授權修正完成後直接提交、部署。
- 唯讀診斷：指定會員的有效本人名片，經舊 CARD_JOIN 同時匹配本人 line_id 與另一會員的 point_line_id；接受新聯絡為開啟，非使用者關閉聯絡。
- 只修改 worker/member-chat.mjs、私訊測試及本工作單；不改 UI、會員／名片／身分連結資料、點數服務、其他 resolver、LINE 推播、商城或正式 bindings/secrets。
- 不建置新會員、不改名片綁定、不以姓名／電話推斷同一人；不讀正式私訊或代發訊息。

## 私訊限定合約（取代前一版的任意別名擴展）

1. 每次 API 仍驗證 LIFF access token，使用 LINE profile 回傳的 userId 精確匹配 users.line_id。
2. 只允許唯一、有效且無衝突的 active user_identity_links 對應新舊 LINE UID；保留新會員 row_id 作對話主鍵。沒有新列時保留既有舊列。
3. point_line_id 不證明聊天身分；legacy_line_id 若沒有明確 active 連結也不證明登入身分。兩欄完全不參與私訊登入／名片／對象識別，不向外擴展帳號集合。
4. 本人名片、搜尋、最新名片選擇及開啟對話使用一致的實際名片綁定：users.line_id／row_id，或唯一 active 新舊 LINE 連結的端點及對應 row_id。保留排除自己的 canonical 帳號、接受新聯絡與封鎖。
5. 不根據點數別名搶用別人的名片、不讓共用別名的第三人讀取／發送／已讀／封鎖／檢舉別人的對話。
6. 身分連結本身有歧義仍拒絕；僅有點數或未確認舊別名的「會員命中」不能取代註冊。名片失效與真正帳號歧義使用明確訊息，不誤稱對方關閉聯絡。
7. 已存聊天與會員主鍵不搬移、不回填；其他功能維持原本點數帳號規則。

## 驗證

- 已讀 core-invariants、feature-change-protocol、既有私訊合約及前一版身分工作單；本合約將修改限制在私訊。
- guard:before：PASS。
- 23 項私訊後端/UI 測試 PASS：共用 point_line_id、點數別名指向別人 line_id、兩組獨立 LINE 連結、未確認 legacy 別名隔離、名片綁定 old UID／row_id 的一致性、本人排除、封鎖與第三人讀取／傳送／已讀／封鎖／檢舉隔離。
- 正式 D1 唯讀核對：指定本人名片的帳號匹配數由 2 筆降為 1 筆；rows_written=0，不改任何正式資料。
- guard:after、node --check、git diff --check、Wrangler dry-run：PASS。現有會員／名片／連結資料快照在合成測試保持不變。
- 正式 LINE 會員互動未代測；不會使用假 token 呼叫正式 API 或代發訊息。發布後僅驗證正式版本、靜態檔案與未登入 API 拒絕。
- 依 Workers / Wrangler 指引使用既有 D1 綁定、參數化查詢與有界查詢；部署保留 vars，無 migration。
