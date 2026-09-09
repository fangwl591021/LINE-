# 店家商城第一階段

- 需求：依福委會特約商店架構開始實作，精選功能第三顆「點數查詢」改為「店家商城」。
- 起始版本：ff3de40，main 與 origin/main 一致；工作樹乾淨。
- 範圍：店家店面、商品管理、公開目錄與瀏覽；商品折抵政策僅保存設定，不提供交易或扣點。
- 第二階段：會員確認、共用點數單純折抵、核銷、防重與補償；不轉點、不結算、不收操作費。
- 不變：名片 ownership、會員登入、既有收銀、點數帳本、年費訂單、外部折抵店家入口均不修改。
- 預計檔案：獨立 store-shop Worker/前端/樣式/SQL migration/測試/文件，worker-entry.mjs 掛接，index.html 指定入口。
- 已讀：core-invariants、liff-routes、points-ledger、button-actions、feature-change-protocol、change-work-order-template；福委會 vendor/offer/location/redemption schema 與 POS 文件。
- 修改前：node tools/run-change-guard.js before PASS。
- 修改後：node tools/run-change-guard.js after PASS；新增商城契約納入 full guard。
- npm run test:store-shop：9 項測試 PASS，使用 Node 24 記憶體 SQLite，涵蓋身分/角色、跨店隔離、重送防重、資料版本衝突、草稿/封存、URL/數字/大小驗證、分頁。CI 增加 Node 24 獨立測試 job，原 Node 20 guard 不變。
- 語法：worker-entry.mjs、worker/store-shop.mjs、前端商城及 loader 的 node --check PASS；git diff --check PASS。
- 瀏覽器：隔離 Chrome 390x844、本機假 LINE 身分及記憶體資料库，使用實際新 API/SQL；點首頁第三顆→店家建置→商品儲存→公開店面 PASS。腳本點擊前 0 次、點擊後 1 次載入；沒有橫向溢出；換行保留、HTML 作文字顯示；獨立公開頁無 LIFF/登入即可讀取 PASS。不是正式 LINE 身分驗收。
- 本輪完成：店面與商品管理（名稱/說明/圖片網址/價格/公開狀態/政策）、公开網址、入口、權限隔離及防誤覆寫。圖片目前使用 HTTPS 網址。
- 待第二階段：實際折抵/核銷/退點、分店/有效期、交易紀錄、數位名片按鈕整合、圖片檔案上傳；本輪不宣稱完整商城交易已完成。
- 後續發版須另獲授權：先檢查並套用 0029 migration，再發 Worker 與 Pages，進行已登入店家/一般會員及跨店實測。未完成 migration 的 API 回明確尚未啟用錯誤。
- 發布授權：使用者於 2026-09-09 明確要求「部署」，本次允許必要 commit/push、0029 migration、Worker 與 GitHub Pages 發布。
- 發布預檢：Wrangler 4.129.0 deploy --dry-run --keep-vars PASS；正式 actmaster_db 僅 0029 待套用、兩張商城表尚不存在，users.line_id/role 欄位確認存在。既有 Worker 回復版本為 4c1e33b9-6257-43bc-a4ee-0a778d748a36。
- 發布驗收：確認 migration 無剩餘、Worker 公開目錄成功與匿名管理拒絕、GitHub Pages/Contract Guard 工作成功、線上資產與 commit 一致；真實店家登入寫入仍需另行驗收。
