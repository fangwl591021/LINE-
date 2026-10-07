# 我的店面 AI 草稿工作單

## 變更摘要
- 需求：公司／店名產生可編輯店面草稿，沿用平台現有 OpenAI 金鑰。
- 起始 commit / 回復點：96d1a768ed10c2709e678ed831cb15516808f097。
- 正確 checkout：.worktrees/member-dm-diagnostics；origin fangwl591021/LINE-；分支 codex/store-ai-draft。
- 部署：line-engine Worker 與 LINE- Pages，保留 vars、secrets、bindings。
- 正式 Worker 起始版本：c01dfe14-4d26-481f-a53c-aaa0e40c1fd0；與基準 commit 的 Worker 程式無差異。

## 只允許修改
- 我的店面增加 AI 草稿入口、來源、預覽與欄位勾選帶入。
- 新增已登入會員使用的草稿 API、限流、安全來源核對及測試。
- cache version、對應契約／工作單與 regression。

## 禁止修改
- UID／LINE 登入、角色、歸屬、點數、商品、訂單、收銀、收藏名片、LIFF、正式金鑰。
- 不自動儲存／公開，不自動替換既有值，不新增 business data 或 migration。

## 影響流程與必讀規格
- [x] 其他：我的店面；既有儲存店面流程不變。
- [x] core-invariants、store-shop、partner-onboarding-ai、store-product-ocr、points-ledger、regression-matrix、feature-change-protocol。
- [x] 身分、名片各版本、scanner／推薦人、分享、免費發訊、手動折抵等既有不變规则保留。

## 修改前驗證
- node tools/run-change-guard.js before：PASS（2026-10-07）。
- 正式 D1 已存在 partner_onboarding_ai_usage；只讀查詢 changes=0。
- 沿用既有 env.OPENAI_API_KEY，前端不接觸金鑰。

## 實作決策
- 新 route /v1/store-shop/store-ai-draft，沿用既有 store-shop actor 權限。
- 無店面者也可產生草稿；只有儲存店面才寫 business data。
- 限流沿用 usage 表，以 store-draft:verifiedUid 命名空間隔離，每日 20 次／間隔 15 秒。
- 六個白名單欄位：name、description、category、address、phone、hours。
- 公司名使用 OpenAI web_search；可補城市／分店或官網。公開來源核對失敗則留白，不猜聯絡資訊。
- 既有值預設不勾選；使用者分析中手動改值、換頁／換帳號、取消，禁止舊結果覆蓋。

## 修改後驗證與上線
- focused tests：32 PASS；完整 guard after：PASS（160 個 smoke/contract 檢查程式）。
- Wrangler 4.148.0 dry run --keep-vars：PASS；bindings 維持原 KV / D1 / R2，無 migration。
- CUA synthetic browser：既有欄位全部未勾選、只帶入介紹、帶入後 saves=0、明確儲存後 saves=1、新店面空白欄位帶入、手動修改保留、取消後舊結果丟棄、服務失敗可繼續手動填寫。
- 手機 iframe 真實 CSS viewport 320 / 390 px：欄位與關閉可操作，320px clientWidth=scrollWidth=299（扣除 scrollbar），無橫向溢出。IAB 外層 viewport 有最小寬度，故不以外層 resize 冒充手機測試。
- 尚待：PR CI、正式 Worker 與 Pages驗證。瀏覽器測試為合成資料，並非正式登入帳號的 OpenAI 搜尋準確度實測；不繞過 LINE 身分。
- 回復：revert 本次 commit；Worker rollback 至上述版本（不涉及資料遷移）。
