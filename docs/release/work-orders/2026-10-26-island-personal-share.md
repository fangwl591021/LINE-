# 人脈島影音名片分享好友與本人專屬連結

- 使用者：分享出去的名片也要有分享好友按鈕，帶自己的專屬連結。
- 起始 b711daa；原 line-engine / LINE- Pages。before guard PASS（../island-personal-share-before.log）。
- 僅新增 Flex「分享好友」URI／單次分享意圖及取得本人連結的唯讀端點；保留影片、加入／註冊／AI審核與參觀規則。
- A 分享帶 A，B 再分享帶 B；B 註冊時原收到 A 的推薦來源由既有首次歸因機制保留，不因對外分享改寫。
- 本人 ref/net 從 LINE 驗證身分與 canonical 會員範圍產生；不沿用入口來源、不信任任意 UID／net／redirect。
- 不修改母站會員分享關鍵字、replyToken、既有會員歸屬或推薦獎勵、點數、資料庫 schema、正式設定或排程；不實際傳送 LINE 訊息。
- 已讀 people-island-onboarding、liff-routes、line-keywords 及 feature-change-protocol。
- after guard PASS（../island-personal-share-after.log）；Flex與本人來源後端聚焦測試15/15 PASS；新增分享瀏覽器12項、既有入口42項及真實登入7項 PASS。
- 新測試使用實際 Flex 與既有首次推薦儲存函式，確認 A/B 專屬連結、原始歸因保持、取消／失敗重試、單次分享意圖、切帳號遲到回覆不分享及公開預覽零 API／零 LINE 初始化。
- Wrangler dry-run 與 diff --check PASS；全部使用合成資料，沒有實際 LINE 發送／點數或會員資料寫入，真人手機實收尚未測。
- 部署既有 Worker／Pages，使用 --keep-vars --strict；無 migration，正式設定與前台原始碼發布後核對。
