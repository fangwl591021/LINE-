# 跨店商品探索驗證

- 正式來源 main 09685f9c306a69763b6afd9a2702dfb03b09ac48；沒有使用舊 dirty checkout。
- 修改前及修改後完整 `node tools/run-change-guard.js before/after` PASS。
- 新增 `node --test test/store-product-discovery.test.mjs`：5/5；商品分類與公司業種分離、商品／說明／店名搜尋、ASCII 大小寫、未分類、通路與折抵篩選、公開欄位白名單、草稿／封存／不合資格店家排除、即時下架、105 件唯一游標分頁、錯誤參數／SQL injection／未知方法、零外部呼叫及零寫入。
- `test/browser/store-product-discovery.cjs`：使用 localhost 臨時 port、SQLite 與虛構公司／商品；320/390/1280px PASS。搜索按摩機、獨立購物分類、詳情／返回保留條件、未分類／網購／折抵篩選、45 件分頁、原找店家及店面入口、XSS、錯誤重試／下架詳情／遲到結果隔離；沒有 JS error、外部請求、橫向溢位或資料寫入。
- 隔離 Chrome 輸出 `.wrangler/product-discovery-qa/result.json` 與 `search-320.png` / `search-390.png` / `search-1280.png`；手機截圖已目視確認。此為合成資料，不是正式交易。
- Worker 4.120.0 dry-run PASS；ACTMASTER_DB / KV / R2 / vars 沿用。本次無 schema migration、沒有新增金鑰、未改收銀或訂單扣退點。
- 正式舊介面唯讀確認：米樂公司「服務」，按摩機商品「購／in_store／percent」；新流程能依真正商品分類找到，毋須改公司業種。
- 這次未操作真實下單、QR 產碼、扣點、退點或修改正式商品。新商品探索只導向既有詳情／購買／登入流程，不建立第二套交易機制。
