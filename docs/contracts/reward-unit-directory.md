# CRM 贈點單位公開目錄

- 管理員在 CRM role=reward 帳號旁開「贈點單位上架」。角色只決定候選資格，不等於公開同意，不授予新贈扣點權限。
- GET /v1/reward-units 公開唯讀，q 最長80、after UUID、每頁20。id UUID 可讀單位詳情；只回 active 且來源帳號仍是 reward 的發布快照。拒絕重複／不明參數，禁止在 GET 寫表或修改 CRM。
- 公開白名單：id/name/description/image_url/phone/address/website_url/reward_terms；不回 LINE UID、個人姓名、CRM 原資料、生日／電話／推薦／財富／健康／標籤或帳務。
- 管理 GET/POST /v1/reward-units/admin 使用現有即時 LINE token 與 authorizeStoreAdmin。target_uid 必須是精確且唯一的 CRM line_id（role=reward）；不依電話／公司猜帳號。GET 預填僅嚴格本人 self_profile 的公司／服務／公司電話／地址／網站，不回退私人 users.phone，不自動保存或公開。
- 0066 獨立空 publication/audit 表，保存管理員核對的公開快照。active 必須 confirmed_public=true、完整介紹與贈點條件、公司聯絡方式，並通過原 requireListingReview（條件作 policy_note）。草稿／隱藏不呼叫 AI。每次明確 active 儲存均重新審核本次內容；失敗／manual／reject 不寫發布紀錄。
- 原子 batch 在 CAS version、來源 role、管理員身分資料快照都不變時記錄防重送 audit，再寫 publication。相同 request_key／actor／payload 重送回同收據，其他內容409；角色或版本競態409，不能部分公開。失敗回安全錯誤，不記 private payload。
- 公開每次 primary read 重驗來源角色及 status；舊詳情不因快取仍可讀。已保存投影不隨未核對的 CRM 修改自動更新；管理員需再送審，不批次公開七個既有帳號。
- 點數通首頁在探索好店前呈現贈點單位，前三張橫向卡片／更多／列表搜尋／詳情／返回；目錄與錢包及探索好店獨立請求，失敗可重試，不假稱空資料，不建立 QR／訂單／贈點。
- 沒有的 Logo／電話／地址／贈點條件不杜撰；卡片提醒實際贈點資格及方式以單位確認為準，瀏覽不保證贈點。
- 不變更既有 partners、名片 resolver、公開池／角色、金鑰或 LINE 推播；本機自動測試不代表真實單位已同意公開。
- 2026-10-20 標題辨識：贈點單位標題列使用與上方探索商品相同的淺綠底／邊框，圓角色BAR、加粗標題、右側更多；手機與桌面全列，空清單也保留。只改展示CSS，不變更來源、審核或交易。
