# 贈點單位標題色 BAR

- 日期：2026-10-20；使用者截圖指出贈點單位不明顯，要求與上方探索商品同樣色 BAR。
- repo：fangwl591021/LINE-；checkout .worktrees/veo-crm-tasks-release；branch codex/reward-unit-title-bar-20261020。
- baseline：82bc8d59eb4ab117a1a101cf6dd2409be11e5ecc。
- guard before：PASS，node tools/run-change-guard.js before。
- 已讀：core-invariants、feature-change-protocol、change-work-order-template、reward-unit-directory。
- 允許：僅贈點單位標題淺綠背景／邊框／圓角／留白／粗體，桌面占滿同一列；保留現有更多與卡片／空狀態。CSS32、entry66更新快取參照及對應斷言。
- 預計修改：css/store-shop.css、store-shop.html、store-shop-entry.js、index.html、reward-unit UI／瀏覽器測試、cache參照測試、此工作單及契約。
- 禁止：Worker、schema、CRM／單位資料、上架審核、角色／UID、點數、QR／訂單、LINE推播、API／金鑰／綁定／排程；不改其他區塊標題樣式或功能。
- 驗收：before/after full guard；320/390/1280px 真實 UI（合成服務）比對兩個BAR底色／邊框一致、完整寬度、更多可用、空清單亦有BAR、無溢出。
- guard after：PASS。相關UI／首頁19項PASS。
- 真實本機瀏覽器320/390/1280px PASS：BAR與上方底色／邊框一致、同寬、標題粗體、更多可操作；空清單也有BAR，無頁面水平溢出；沿用目錄／上架全流程驗證，沒有正式資料寫入。
- 截圖：C:/Users/User/AppData/Local/Temp/reward-unit-title-bar-qa-20261020/empty-bar-390.png；已目視確認。
- 部署：測試通過直接發布 Pages，不部署 Worker、不執行migration。
