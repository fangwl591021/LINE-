# 按摩機單品人工放行網購

- 使用者明確同意：只放行「光動能按摩機」，保留稽核；其他審核規則不變，NT$11,800／最高折抵50%不變。
- Repo LINE-，branch codex/massage-manual-online-20261019，起點 main 24faac7f34bb2a6567b3de40f5ec58742931d616。
- Worker line-engine，Cloudflare8058cf61f0cd44c4edd78080b193033a；D1 actmaster_db/8a0107f9-000d-4810-b6bf-5d599b699195；非 Smart Menu 根專案。
- BEFORE full guard PASS（功能修改前）。已讀 README、core invariants、points-ledger、store-commerce、store-admin-catalog、store-listing-review、release protocol/checklist/template、regression matrix。

## 最小範圍

在既有 admin/catalog（已驗證管理員）加入固定單品的明確確認請求及 UI。只允許 product ec46afc6-dacd-487c-8ca5-c7f993ea2612、shop1c607ea5-3ff8-4232-8cfb-8fc099435ea8、product version1 / shop version6 的 active in_store → online。
需比對核准的文字＋圖片 bytes SHA256、政策2026-10-08-v1及原 medical-only manual review；無審核、reject、error、其他疑慮、版本或內容變更均拒絕。
只改 purchase_mode；沿用 catalog CAS、身分／owner角色寫入閘門、request_key 防重、同一原子 batch 的 audit 與更新；審核紀錄維持 manual，不偽造 allow 或醫療／安全認證。
此次同意消耗於 product version1 → 2，後續修改仍走原 AI 審核，不建立一般商品免審功能。

## 正式唯讀證據

- 光動能按摩機 active/in_store/version1、空介紹、category購，NT$11,800、percent50；shop version6。
- 對應 content hash 0e76c786df74b8450aff05845f1930a7986112d359dcdd50b1ef639ed5b4406e。
- 圖片 hash d2c9694f794db503cd6a336579d6e3382e582e09bebc1038cfb66252bfb09d1f，208272 bytes；既有 scoped review manual、medical issues only。D1查詢 rows_written0。

## 禁止事項與部署

不改母站帳本、點數規則、收銀、會員／歸屬、訂單、公開池、其他店家、AI政策／模型／金鑰／審核記錄。不建正式測試訂單、不扣點、不匯款。
Workers/Wrangler skills 用於同帳號資源核對、原子 audit／版本保護、乾淨 archive build與 keep-vars 發版；OpenAI credential skill安全確認既有 secret 存在，沿用使用者先前明確同意的金鑰，不建立或輸出秘密；新人工分支不呼叫 provider。
既有 observability設定不在本次變更；避免擴大含token請求記錄範圍。無migration／新binding／新secret。

## 驗證與回復

- 必跑：正／負角色、固定商品與內容、字串／多餘flag、已使用、重試、其他商品／舊review、SQL race／失敗rollback、一般審核回歸、UI三尺寸、before/after guard、Wrangler dry-run。
- 發版後以已登入管理員UI明確確認，核對公共API purchase_mode、version及單品audit；只進入結帳，不建立訂單。
- AFTER full guard PASS；單品11/11、單品＋原AI審核＋catalog首輪56/56，以及單品＋商城扣退點回歸首輪66/66 PASS。管理UI 320/390/1440明確確認、夾帶修改拒絕、無能力隱藏、同鍵重試 PASS；原 admin-mall-linked 三尺寸 PASS。
- 使用相同正式文字及公開圖片經新共用證據讀取器重新計算，hash與已同意指紋完全相同（僅公開GET，無provider／資料寫入）。
- 已檢視合成UI畫面；新UI及runtime／目錄cache版本同步更新。發版版本與正式寫入結果待填。
- 程式回復點9d7037f8-0da4-498b-9825-07bf3527ab5e；產品設定不隨程式rollback，若需回復應再做一筆有紀錄的online→in_store更新，不刪除稽核。
