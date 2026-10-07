# 我的店面 AI 草稿契約

輸入公司／店名，按「AI 產生店家草稿」，先預覽再勾選帶入，最後由既有「儲存店面」建立／更新。AI 操作不儲存或公開店面。

- POST /v1/store-shop/store-ai-draft：沿用既有 LINE Bearer actor 與已登記角色，不接受 client UID、role、model、key 或 status。
- 只接受 name（2–80 字）、hint（選填 120 字）、websiteUrl（選填公開 HTTPS 500 字），請求上限 4096 bytes。
- 只回傳六欄草稿與公開資料來源。原有 name/description/category/address/phone/hours、status、version、封面預設保留。已有值須明確勾選替換；分析中手動修改一律保留。
- 使用平台 OPENAI_API_KEY；model 僅能由伺服器 OPENAI_MODEL 設定，未設定採支援 web_search 的 gpt-4.1-mini。store:false；不保留 AI 結果。
- 名稱搜尋必須執行 web_search 並回傳工具實際來源。官網以既有 readWebsite 限制 HTTPS、DNS 公開 IP、每次轉址重新驗證、HTML 大小與 timeout；不傳遞 LINE token。
- 地址、電話、營業時間需同一已確認商家的來源文字佐證；讀不到／不吻合留白並提示。同名、找不到、來源無法確認不拼湊其他店的資訊。
- 草稿生成僅寫 partner_onboarding_ai_usage 的 store-draft:UID 限流；台灣日期每日 20 次／15 秒間隔，原 admin AI 配額不變。無 migration、R2、店面／商品／點數／身份資料寫入。
- 有取消／關閉、即時狀態、重送阻擋；換頁／帳號、改搜尋資料、取消後的結果不能帶入。
- bounded response 256 KiB、AI timeout 45 秒、公開頁每次 15 秒；最多核對兩頁，前端 90 秒上限。錯誤只回安全訊息及診斷碼，不記录私人輸入、key、UID、上游原文。
- 測試包含真實 route 權限、白名單、quota、source、安全失敗、取消／手動資料保護、mobile 版面、no auto-save。
- Worker compatibility 2026-04-23 的 OpenAI 與來源 DNS fetch 必須採 redirect:manual；非成功 HTTP（含3xx）拒絕，不跟隨轉址、不把金鑰傳到其他 origin。實際 Workers fetch 驗證與 mocked AI 成功須分開記錄。安全失敗紀錄只增加 providerStatus 與固定白名單 errorClass，不記錄 error.message 或上游原文。
