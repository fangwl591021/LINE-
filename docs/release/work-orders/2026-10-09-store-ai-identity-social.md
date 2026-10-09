# 店家 AI：識別公司後擷取網路／社群內容

- 需求：統編／公司名稱只用來找正確店家，介紹應從官網與公開社群取得，不要求使用者先自行找網址。
- 起點：origin/main e153b297466c23c03603558ec7d451dd45a916ac；分支 codex/store-ai-identity-social-20261009。
- 部署：否；本次先修正與驗證，發布需另有明確授權。
- 修改前完整 `node tools/run-change-guard.js before`：PASS，store-ai-identity-social-before-20261009.log。
- 已讀：core-invariants、store-shop、store-ai-draft、feature-change-protocol、change-work-order-template、regression-matrix；沿用平台 OPENAI_API_KEY，僅確認 secret 名稱，不取出或改寫金鑰。

## 範圍

- 店家草稿公司識別與內容來源分開；登記來源可證明名稱／統編，不能作介紹。
- 在本次搜尋實際來源中核對公司與品牌關聯；社群使用品牌名時須有公司／品牌或統編關聯證據，不單憑 AI 宣稱同一家。
- 官網、公開 Facebook／Instagram 與公開商家介紹可提供服務內容；讀不到的公開社群索引僅作明示、預設不勾選的介紹／業種草稿，不將索引電話／地址冒充已核對事實。
- 實際檔案：worker/store-ai-draft.mjs、worker/store-ai-identity.mjs（新）；js/modules/store-ai-draft.js、store-shop.js、store-shop-entry.js、index.html、store-shop.html；專屬 backend/UI/browser fixtures 與新增 store-ai-identity-social.test.mjs；契約、本工作單與 full smoke runner。
- 快取更新：store-ai-draft v4、store-shop v53、store-shop-entry v55；CSS 與其他功能版號不變。store-admin-entry、store-invite-share、store-points-home、store-shop-cover 的靜態版號期待值同步更新，沒有改其產品行為。

## 禁止修改

- 不改登入／UID／owner／角色、店面儲存、商品／審核、配額、點數、LINE 回覆、bindings／secrets／compatibility。
- 無 migration、正式資料庫或 R2 寫入；不登入社群、不讀私人內容、不繞過 CAPTCHA 或來源網站存取限制。
- 不把合成 AI／索引來源驗證稱為正式 OpenAI 端到端成功；正式手機驗收另記錄。

## 實作

- 公司識別與營業内容拆開核對；統編已確認或另一可讀頁面明示完整公司名時，不再被登記頁的 name citation 失敗一起清空。
- identity 只作內部來源核對；品牌／舊名須讀到明確相鄰的經營關係原文，或已核對統編的關聯。同段提到兩個名稱及「品牌」不算關聯；同名歧義、否定關係、另一統編與其他公司內容拒絕。
- web_search 增加公開社群／品牌搜尋指示與 medium context；保留既有 model、45 秒及 store:false。只核對實際引用來源，避免原先「前 12 筆搜尋結果」截掉相關的後續來源；公開頁最多四頁平行讀取。
- Facebook／Instagram 公開 profile 內容可作服務證據；不可讀索引須具本次 completed search URL 及已核對名稱／品牌 title，且只能作預設不勾選的介紹／業種草稿，不能生成聯絡事實。沒有繞過驗證或登入社群。
- 前端網址選填、明示自行搜尋官網／公開社群；未確認商家與同名歧義分開提示，不反覆要求使用者填統編／官網。原值、分析中手動編輯、取消／過期結果與明確保存流程保留。

## 驗證結果

- 必測公司名證據在登記頁而服務在另一頁、統編且無 AI name evidence、不同品牌但有可讀關聯證據、無關品牌／衝突統編拒絕、社群索引待核對、缺內容部分成功、原值與手動編輯保留、取消與不自動儲存。
- `node --test test/store-ai-draft.test.mjs test/store-ai-draft-ui.test.mjs test/store-ai-identity-social.test.mjs`：93 / 93 PASS。皆使用合成 provider，真實 route 與 SQLite 隔離資料庫；正式 AI 回覆不是這些測試的證明範圍。
- Chrome／Playwright：320、390、1366px 全通過；統編→服務→重新產生；公司名（不填統編／網址）→已證品牌→公開社群；索引不預選、原值保留、帶入不儲存、無橫向溢出與關閉操作。0 正式網路請求、0 店面保存；截图在 C:\Users\User\AppData\Local\Temp\store-ai-identity-social-20261009。
- 實際公開來源讀取：1111 公司頁含完整公司名但服務內文受 CAPTCHA 遮擋；trade.1111 自述頁可讀實際網站／網路行銷服務，但為舊公司名且未取得統編關聯，不能直接冒充當前店家資料；findbiz 公示頁在此 transport 不可讀。沒有突破來源限制。
- 一次真實公開頁 fetch ＋合成 provider 驗證：完整公司名出現在可讀的 1111 驗證頁，可保留其搜尋介紹為 reviewFields 草稿，不列不可讀登記頁為已確認來源。正式 OpenAI 呼叫 0、正式資料寫入 0。這不是正式 AI 搜尋精準度或 LINE 手機端到端驗收。
- 首次 after guard 僅因四個上述快取版號靜態期待值仍為 v52／v54 失敗；同步期待值後 full after guard PASS，新測試已納入 full smoke runner。log：C:\Users\User\AppData\Local\Temp\store-ai-identity-social-after-final-20261009.log。
- Wrangler 4.148.0 `deploy --dry-run --keep-vars --strict` PASS；只打包，不發布。不變更 wrangler.toml／bindings／secrets／compatibility，沒有 migration。
- 技能使用：openai-platform-api-key（沿用現有 secret，只確認名称）、workers-best-practices（有限公開來源、安全失敗、credential 不轉送）、wrangler（既有 CLI 與 dry-run，未部署）。

## 發布與剩餘驗收

- 本次尚未部署、未 push／開 PR，正式站仍為先前版本。
- 尚未以登入平台的有效 actor 跑正式 OpenAI 的公司名稱／統編搜尋；發布後需驗收真實公司結果、來源與公開社群摘要品質。不能用合成 provider 測試宣稱正式 AI 已成功。
- 不保证所有公司或受限／未索引社群必有資料；沒有可核對來源時保留空白與原值，不能改用登記項目、猜測品牌或捏造電話補齊。
