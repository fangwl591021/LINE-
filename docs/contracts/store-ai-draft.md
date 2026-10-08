# 我的店面 AI 草稿契約

可只填 8 位統編，按「統編查公司」直接查經濟部登記資料，名稱／區域可留白；或輸入公司／店名按「AI 產生店家草稿」。先預覽再勾選帶入，最後由既有「儲存店面」建立／更新。查詢／AI 操作不儲存或公開店面。

- POST /v1/store-shop/store-ai-draft：沿用既有 LINE Bearer actor 與已登記角色，不接受 client UID、role、model、key 或 status。
- 只接受 name（有統編可空，否則 2–80 字）、hint（選填 120 字）、websiteUrl（選填公開 HTTPS 500 字）、taxId（選填 8 位數字）、mode（generate 預設／registry）。registry 必須有統編，不需要名稱／區域／官網；請求上限 4096 bytes。
- 統編不進店面保存 body／schema，不作歸屬或公司認領依據。固定 HTTPS 經濟部 API 公司基本資料 5F64D864、查無再商業基本資料 426D5542；每次輸出統編必須完全吻合且唯一。12 秒共享上限、64 KiB JSON、最多兩筆、redirect:manual、credentials:omit、不帶 LINE 或 OpenAI token。
- 官方錯誤 HTTP、IP 介接拒絕（含 HTTP200 文字）、非 JSON、巨大／不完整、回錯統編／重複，都顯示安全服務錯誤，不冒充「查無公司」。空陣列才是查無；不因官方失敗猜測其他公司。
- registry 直接預覽官方名稱／登記地址／狀態；登記地址可能不是實際店面地址，須核對。電話、時間、介紹若未提供留白。可另按「AI 補充介紹」，核對官方登記營業項目 236EE382；只描述登記業務摘要，不宣稱實際銷售全部項目。
- generate 有統編時，名稱／地址以官方結果為準；可讀官網必須包含該公司名稱。AI／官網／額外營業項目失败保留基本官方預覽；AI 原本 name-only HTML 證據規則不放寬。
- 只回傳六欄草稿與公開資料來源。原有 name/description/category/address/phone/hours、status、version、封面預設保留。已有值須明確勾選替換；分析中手動修改一律保留。
- 使用平台 OPENAI_API_KEY；model 僅能由伺服器 OPENAI_MODEL 設定，未設定採支援 web_search 的 gpt-4.1-mini。store:false；不保留 AI 結果。
- 名稱搜尋必須執行 web_search 並回傳工具實際來源。官網以既有 readWebsite 限制 HTTPS、DNS 公開 IP、每次轉址重新驗證、HTML 大小與 timeout；不傳遞 LINE token。
- 地址、電話、營業時間需同一已確認商家的來源文字佐證；讀不到／不吻合留白並提示。同名、找不到、來源無法確認不拼湊其他店的資訊。
- 草稿生成僅寫 partner_onboarding_ai_usage 的 store-draft:UID 限流；台灣日期每日 20 次／15 秒間隔，原 admin AI 配額不變。registry 另以 store-lookup:UID 每日 60 次／3 秒間隔，不讓快速官方查詢占用 AI 額度或阻擋接續 AI 補充。無 migration、R2、店面／商品／點數／身份資料寫入。
- 有取消／關閉、即時狀態、重送阻擋；換頁／帳號、改搜尋資料、取消後的結果不能帶入。
- bounded response 256 KiB、AI timeout 45 秒、公開頁每次 15 秒；最多核對兩頁，前端 90 秒上限。錯誤只回安全訊息及診斷碼，不記录私人輸入、key、UID、上游原文。
- 測試包含真實 route 權限、白名單、quota、source、安全失敗、取消／手動資料保護、mobile 版面、no auto-save。
- Worker compatibility 2026-04-23 的 OpenAI 與來源 DNS fetch 必須採 redirect:manual；非成功 HTTP（含3xx）拒絕，不跟隨轉址、不把金鑰傳到其他 origin。實際 Workers fetch 驗證與 mocked AI 成功須分開記錄。安全失敗紀錄只增加 providerStatus 與固定白名單 errorClass，不記錄 error.message 或上游原文。
