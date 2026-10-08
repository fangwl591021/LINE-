# 店家入口名稱依公開商品判斷

## 範圍
- 使用者：探索好店按鈕預設「前往店家」，僅有已上架商品才能顯示「進入商城」；「開市」依上下文視為開始實作。
- 基線：origin/main d83bc6f13dfe75680dee67142409f8ed4175fb7c；branch codex/store-entry-label；checkout .worktrees/member-dm-diagnostics；origin fangwl591021/LINE-。
- 公開目錄／直接店面新增唯讀 has_active_products=0/1，使用現有 shop_id/status/id 索引的 EXISTS 查詢；首頁推薦與搜尋／分頁列表依相同旗標改名稱。
- active 店內商品與 active 網購商品皆符合；draft/archived 不算。純 partner 目錄固定 0；缺旗標的舊回應保守顯示前往店家。
- 只改入口標籤及唯讀 API 展示欄位，不改 data-do=view、shop ID、搜尋、分類、排序、分頁或原店家詳情／交易入口。

## 禁止
- 不改既有 AI 上架審核、登入／角色／owner、商品狀態／價格、點數、订单、收銀、分享歸屬、bindings 或 secrets。
- 無 migration 或正式資料修改；不逐店追加請求／不等候 AI。
- 本次只有開始實作授權；未部署／未推送。

## 契約與驗證
- 已讀 feature-change-protocol、core-invariants、store-shop；修改前 guard PASS，.wrangler/store-entry-label-before.log。
- 實際修改：worker/store-shop.mjs、worker/store-partner-catalog.mjs、store-shop／store-points-home 前端、快取載入版號、契約及相關測試。
- 驗證：沒有商品／僅草稿與封存／至少一件上架／別店商品／店內及網購／商品最後一頁／partner／缺旗標；保留同一 view ID 及單次目錄請求。
- 修改後完整 guard、Worker 打包及隔離瀏覽器；不在正式站更動商家或商品作測試。
- 回復：撤回此次標籤／欄位／載入版號；無資料回復或 migration。

## 驗證結果
- 相關 Node 測試 50 項通過、0 失敗：.wrangler/store-entry-label-focused.log。
- 修改後完整 change guard 通過（161 項 smoke contract checks）：.wrangler/store-entry-label-after.log。
- JavaScript 語法檢查及 git diff --check 通過。
- 專案本機 Wrangler 4.148.0 deploy --dry-run --keep-vars 打包通過，未上傳：.wrangler/store-entry-label-dry-run.log。
- 隔離 loopback HTTP 預覽使用真實唯讀 handler／SQLite 合成 fixture，沒有接正式登入、AI 或正式資料寫入。
- Chrome 手機尺寸 390×844：首頁推薦與店家列表的無商品／僅草稿顯示「前往店家」，active 商品顯示「進入商城」。兩種入口皆能進原本店面，草稿不外露，active 商品正常顯示。
- 截圖：.wrangler/store-entry-label-preview.png、.wrangler/store-entry-label-phone.png。臨時尺寸已還原、測試頁已關閉。
- 僅本機完成；未部署 Worker、未推送 GitHub／Pages、沒有 migration 或正式資料更動。
