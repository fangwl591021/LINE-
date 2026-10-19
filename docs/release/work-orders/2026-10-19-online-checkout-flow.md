# 網購所選商品與順序結帳修正

- 日期：2026-10-19；repo fangwl591021/LINE-；分支 codex/online-checkout-flow-20261019。
- 起點 main 43b905fe849645b0194b28c4719b1e3f34164a2e；Worker line-engine / GitHub Pages LINE-。
- 使用者要求：選定商品後依序檢查折抵、運費、匯款及訂單結果，不可帶入同店其他商品；測試通過後部署。
- before：完整 `node tools/run-change-guard.js before` PASS，未修改功能前執行。

## 範圍與禁止事項

只改商城詳情到網購的商品 ID 傳遞、順序結帳 UI、訂單匯款回報入口及審核失敗提示；新增隔離測試、契約及快取版本。
禁止改母站帳本、扣退點服務／冪等鍵、店內收銀、會員身份、歸屬、LINE 回覆、審核決定、既有商品資料及歷史訂單。
沿用既有資源、開關、金鑰與 migration；本次不需 migration。

## 已讀契約

README、core-invariants、feature-change-protocol、change-checklist、change-work-order-template、store-commerce、store-admin-catalog、points-ledger、liff-routes、regression-matrix。
Workers best practices / Wrangler skills 及 runtime-patterns、configuration；既有審核與資料不改。

## 正式唯讀診斷

公開 API：按摩機 ec46afc6-dacd-487c-8ca5-c7f993ea2612，version=1，active，in_store，NT$11,800，percent=50，介紹空白。
同店點數通 f0faa493-3d34-4b8d-8336-26b5f0694b2d，online，NT$6,000。
原商品詳情 CTA 只帶 shop id；不得把店級選購誤當選定商品的購買。
歷史審核 receipt 顯示 manual，且使用者未確認實物型號；不得藉本任務改成 allow 或直接 SQL 改網購。

## 測試／部署紀錄

- AFTER guard：末次功能調整後完整 PASS。
- 合成 UI：多商品非首件、過期／不存在／限店內不得替換、行動及桌面、報價／點數／運費、下單及回報匯款、取消退點、未知結果同鍵恢復。
- 真實訂單／母站扣退點：本次不寫入，不能以合成驗收宣稱實際商品已開放網購。
- 發布／回復：待填；前版 Worker 9d7037f8-0da4-498b-9825-07bf3527ab5e。

## 實作與驗證

- 修改 js/modules/store-shop.js、store-commerce.js、store-admin-catalog.js 與新增 scoped css/store-commerce.css；入口快取與 admin bridge 版本同步更新。所有 worker、母站服務及資料設定均不改。
- 最終相關 Node 測試 112/112 PASS；其中 storefront 16/16，包含公開登入上下文、重複參數及登入過期保留所選商品。
- test/browser/store-checkout-flow.cjs：320/390/1440px PASS。非首件 p-b / NT$11,800 / 50 點 / NT$60 運費 / NT$11,810 應匯；報價無扣點、明確勾選及雙擊只建一單、取消精確退點；390px 原單回報末五碼仍待核帳；失效銷售模式不替換商品；審核失敗原模式提示。
- 原 test/browser/store-commerce.js：320/390/1440px PASS，lost response 同鍵恢復、回報／核帳／出貨／完成、XSS／無溢出及晚回應隔離。
- 原 store-commerce-points-run.cjs：390/1280px PASS，買家取消退點與店家確認現金／退款後退點，實際為隔離 SQLite／假母站，不是正式交易。
- 原 admin-mall-linked.mjs：320/390/1440px PASS，相同請求重試、上傳、銷售能力限制與登入改變隔離。
- 瀏覽器 QA 輸出於本機 Temp，避開 OneDrive 寫入限制；正式資料寫入 0。
- 正式 D1 再查最新 manual reviewed_at=1792375083167，catalog audit saves=0，兩項查詢 rows_written=0。未沿用審核文字作醫療器材法律認定。
- 發布範圍為 GitHub Pages 前端；Worker runtime／設定／migration 未變，不重發無變動 Worker。回復為 revert 本 PR 重新發 Pages；正式 Worker 維持 9d7037f8-0da4-498b-9825-07bf3527ab5e。
