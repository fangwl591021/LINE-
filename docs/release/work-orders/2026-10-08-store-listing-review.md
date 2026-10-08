# 店家／商品公開上架 AI 審核

## 1. 變更摘要
- 日期：2026-10-08；起始 commit ba4f407c7b83c436feef3150c042d7935427bf04。
- 使用者要求：八大行業、詐騙、菸酒、醫療用品、犯罪、色情等不得上架；只審新增及修改後上架，不批次下架既有內容。
- 實際範圍：共用 store-listing-review Worker、store-shop／admin catalog／admin products／partner-directory 公開寫入關卡、對應表單提示、契約、0058 additive review migration、測試及載入版本。partner-onboarding-ai 只匯出既有 DNS 檢查；core 只延長 savePointRedemptionPartner 的請求逾時，沒有修改登入／授權邏輯。
- 尚未部署；沿用現有平台 OPENAI_API_KEY，不修改 secrets／bindings／compatibility date。

## 2. 只允許
- 新增／修改時 status=active 必須由後端審核目前待儲存的文字及圖片，管理員亦不豁免。
- 通過才執行既有保存流程；拒絕、疑似、無法辨識、AI 失敗皆不公開、不覆寫原內容。使用者仍可明確選草稿保存或下架／封存。
- 同政策及相同內容／圖片位元組短效快取，修改後重新審核；保存安全審核結果與原因，不公開 actor UID。
- 前端顯示審核中及失敗理由；服務故障不等同違規，保留表單供修改、草稿保存或管理員核對後重新送審。

## 3. 禁止
- 不改登入、UID／owner、名片、點數、價格／折抵／支付／交易規則。
- 不自動批次下架既有資料；不硬刪；不自動公開或用統編授權。
- 不接受前端 pass、審核結果、模型、token 或 skip-review 作為放行依據；沒有管理員免審後門。

## 4. 政策
- 八大行業涵蓋舞廳、舞場、酒家、酒吧、特種咖啡茶室、視聽歌唱（KTV）、三溫暖、夜店；陪侍／性交易／視聽理容亦禁。普通旅館、一般理髮、一般美容、咖啡店不因單一歧義詞自動定罪。
- 禁止菸草／電子菸／加熱菸／酒類銷售，醫療用品／藥品／醫材，詐騙與不實保證收益，色情／性交易，毒品／非法武器／偽造證件／人頭帳戶／賭博與其他犯罪交易。
- 一般非醫療用途日用品與正常金融／醫療相關教育資訊分開辨識。內容不清楚停在待確認，不能當作通過。
- 這是平台上架限制，不宣稱所有受限行業／商品本身違法；AI 不是零漏判保證，疑似內容需人工核對與重送。
- 八大定義參考臺北市商業處：https://www.tcooc.gov.taipei/News_Content.aspx?n=DB5AB1BDDC2B5BDA&s=0556B1B5495EE9A9。

## 5. 修改前
- 已讀 core-invariants、store-shop、store-admin-catalog、store-admin-directory、feature-change-protocol、regression-matrix。
- npm.cmd run guard:before PASS；.wrangler/store-listing-review-before.log。

## 6. 完成驗證（2026-10-08）
- node --test test/store-listing-review.test.mjs test/store-shop.test.mjs test/store-admin-catalog.test.mjs test/store-admin-products.test.mjs：83 tests PASS；其中新審核測試 23 項。涵蓋合法／各禁類／歧義／提示指令注入／圖片不完整／上游故障／偽造 pass／快取／跨店／角色撤銷／版本衝突／重送／每日額度與草稿。證據：.wrangler/store-listing-review-focused.log。
- npm.cmd run guard:after：完整 161 個檢查 PASS，包含既有登入、名片、點數、交易及管理員契約；快取版號測試按實際載入版號更新，原功能斷言保留。證據：.wrangler/store-listing-review-after.log。
- test/store-listing-runtime.cjs：workerd 同正式 compatibility_date=2026-04-23、flags=[]，實際本機 D1／Web Crypto／圖片 inline／快取／allow／manual／error／reject／無金鑰草稿均 PASS。證據：.wrangler/store-listing-review-runtime.log。
- 隔離瀏覽器 390×844：儲存立即顯示 AI 審核中並鎖定表單；manual 與 error 後恢復編輯、保留輸入及原 active version=1；明確草稿成功且不再呼叫 AI；allow 才更新 active version=2；「販售電子菸」後端規則直接拒絕且不呼叫 provider。證據：.wrangler/store-listing-review-phone.png（需人工核對提示）。最後禁售截圖逾時，保留已取得的手機提示截圖；DOM 結果已驗證。
- npx.cmd --no-install wrangler deploy --dry-run --keep-vars：PASS，1472.03 KiB／gzip 330.92 KiB。證據：.wrangler/store-listing-review-dry-run.log。git diff --check PASS。
- 沿用平台 OPENAI_API_KEY 及伺服器 OPENAI_VISION_MODEL／OPENAI_MODEL；未設定模型時採與既有店家 AI 草稿相同的有效 API 模型 gpt-4.1-mini。公開官方文件確認其支援圖片與 Structured Outputs：https://developers.openai.com/api/docs/models/gpt-4.1-mini。前端不能覆蓋模型或金鑰。

## 7. 尚未執行與限制
- 尚未部署或套用正式 migration；沒有正式店家、商品、交易、點數、角色、binding 或 secret 的寫入。origin/main 仍為 ba4f407c7b83c436feef3150c042d7935427bf04。
- Provider 回覆／圖片內容以合成 fixture 測試；尚未用正式現有金鑰測試 AI 判斷準確率或實際服務延遲。測試通過證明上架攔截流程，不代表 AI 對真實資料零漏判或零誤判。
- 不批次審查既有公開內容，不爬訂購連結目的頁；外部圖片在發佈後被替換仍是殘餘風險，重新上架時會重讀位元組。未新增人工覆核批准入口或管理員跳過開關。

## 8. 經授權才部署
- 部署授權：2026-10-08 使用者明確回覆「好了就部署」。發布基線已重新核對：origin/main ba4f407c、line-engine 正式 c5a3c9e3-3661-46b5-8b12-38b421279b46（100%）；現有 OPENAI_API_KEY secret 名稱存在，25 個 binding／var／secret 項目及原相容日期保留。0058 的兩張表尚不存在；0042／0043 是無關待執行 migration，禁止本次套用。
- 先核對 checkout／branch／origin main／Worker metadata 與現有 secret 名稱，保留設定；只套用 0058（不執行其他 pending migrations），再部署 Worker --keep-vars 與對應前端。
- 正式驗證需區分 health、Worker 版本、前端載入 hash／版號、migration 與使用既有金鑰的無公開寫入審核測試；不可拿真實違禁商品公開作為驗收。
- 退版保留新稽核表及資料。正式舊版並未實施此門檻，回退會撤除新審核，需明確報告。
