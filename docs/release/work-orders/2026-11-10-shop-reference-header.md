# 商城標頭共用樣式衝突修正

- 正式驗證發現：店家角色切換探索目錄後，舊的 `.shop-lifestyle .shop-brand>div` 蓋過新工具列隱藏規則，讓品牌列擁擠。
- 基線：main 3b13882；PR323完整CI及本機guard通過；本輪 `node tools/run-change-guard.js before` PASS（repo外header-before.log）。
- 範圍：只修商城工具列display specificity、標頭必要尺寸、快取及對應瀏覽器呈現驗證；不改API、角色權限、點數、商品資料或Worker。
- 契約：DESIGN、store-shop、core-invariants、feature-change-protocol、line-release-verification已讀，沿現有呈現限制。
- 驗證：`node tools/run-change-guard.js after` PASS（repo外header-after.log）。隔離瀏覽器完整流程PASS；320/390/1280店家→探索→店家各連續兩次，consumer工具列display=none、merchant恢復flex，返回/品牌/切換/兩工具所有可見點擊區不重疊；原角色/資料與44px/圖片完整檢查維持通過，正式外連與API寫入0。
- 發布：前端shell CSS v2，三個載入入口shopReference=2。正式頁面截圖與檔案雜湊驗證留repo外，不刊登會員資料。
