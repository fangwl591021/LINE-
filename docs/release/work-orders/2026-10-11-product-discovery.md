# 跨店商品探索

- 使用者要求：改善只按公司業種找店家、找不到商品的流程。保留找店家，新增找商品與商品分類，不改商品本身資料。
- 正式來源：LINE- main 09685f9c306a69763b6afd9a2702dfb03b09ac48；分支 codex/product-discovery-20261011；目標 line-engine 與 GitHub Pages LINE-。
- 修改前完整 change guard before PASS。
- 已讀：core-invariants、feature-change-protocol、regression-matrix、store-shop、deployment-runbook；Workers / Wrangler 技能與 relevant runtime/platform/config 參考。
- 允許：唯讀公開商品 API、商品探索 UI、搜尋／商品分类／通路／折抵篩選、既有詳情／店家／網購入口、樣式與快取版本、測試及契約。
- 禁止：母站帳本、收銀、點數扣退、UID、登入、商品／店家歸屬、上架審核、既有銷售方式、價格及分類值；不自動修改正式資料、不新增 migration、不建立正式訂單。
- GET 商品只列 active 商品、active 店面及原符合資格 owner；不公開 owner_uid、request_key、銀行或私人欄位；草稿／封存／失格者不顯示。
- 商品分類使用 p.category，不拿店家業種代替；空分類保留且可在未分類查找。搜尋商品名稱／說明及公開店名，支援 bounded keyset pagination。
- 測試：公司服務業種＋購物商品獨立分類、隱藏狀態、權限及回傳白名單、游標、SQL/XSS、零寫入；320/390/1280 px 假資料操作、舊店家流程、正式唯讀 API/UI。after guard / dry-run 必須 PASS 才可部署；保留 secrets / bindings --keep-vars。
- 完成：after 完整 guard PASS；新增 5 組 SQLite 測試 PASS；320/390/1280 px 隔離 Chrome PASS，包含錯誤重試、下架詳情拒絕、遲到結果隔離、45 件分頁及零寫入。Worker dry-run PASS，原 bindings 不變。
- 正式唯讀預檢：米樂公司業種「服務」；光動能按摩機商品分類「購」、限店內、percent 折抵；點數通系統「服務」、網購、none 折抵。無須修改公司或商品分類，沒有執行正式資料寫入。
