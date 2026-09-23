# 商城大富翁（不贈點）

- 起始版本：a4c58cc；使用者要求最小修改，新增到遊戲館、保留原人脈版；2026-09-23 完成本機驗證，2026-09-24 使用者核准「提交、部署」。
- 允許：business-richman 共用棋盤的模式選擇、獨立 store-richman 公開店家 provider、game-center 入口、store-shop-entry 的可選返回鍵、index 快取版本、相關測試與契約。
- 禁止：Worker、資料表、身分／名片解析、名片內容、AI、優惠券、交易與贈扣點。商城版不使用 startGame / completeGame / gameEvent，不列入每日挑戰或領獎統計。
- 規格：擲骰前進後隨機抽已上架商城，盡量不連續重複；直接在同頁 LIFF 開店面，提供返回棋盤及返回遊戲館；個別使用者與兩種模式進度分開。
- 資料：沿用 GET /v1/store-shop 隨機 seed 的 40 筆公開樣本，不掃全資料庫；開啟前再讀 ?shop=ID 確認仍公開。沒有店家、下架、網路錯誤皆提供明確提示／重試，不使用假店家。
- 已讀：feature-change-protocol、core-invariants、liff-routes、game-center、store-shop 公開目錄與店面契約。
- guard before：PASS（本次編輯前）。
- 測試計畫：模式隔離、名片版保留、隨機／重複／下架／空名單／網路錯誤、進度返回、快速離開與切換、無發點請求、本機手機排版；最後完整 guard after。
- guard after：PASS（`node tools/run-change-guard.js after`）；`git diff --check` PASS。
- 相關測試：`node --test test/store-richman.test.mjs test/business-richman.test.mjs test/store-invite-storefront.test.mjs test/store-shop-shell-navigation.test.mjs`，30 項通過。
- 原人脈版契約只更新過期的 navigation 版本字串（8.02 → 現行 8.03），未刪減行為斷言；加入 full guard，並新增商城模式的執行測試。
- 瀏覽器：使用實際棋盤、遊戲館、商城入口與店面模組＋本機合成店家；390px 完成擲骰 → 開店／商品 → 返回棋盤（第 2 回合、原位置）→ 返回遊戲館；320px 無橫向溢出，重新載入可恢復進度。測試頁未連正式資料／發點，圖示字型用測試替身；尚未驗證手機 LINE 實機。
- 修改檔案：`js/modules/business-richman.js`、新增 `js/modules/store-richman.js`、`js/modules/game-center.mjs`、`js/modules/store-shop-entry.js`、`index.html`、新增 `test/store-richman.test.mjs`、`test/business-richman.test.mjs`、`tools/run-smoke-contracts.js`、`docs/contracts/game-center.md` 與本工作單。
- 未修改 Worker、migration、會員驗證、點數帳本、商品／訂單或電子名片內容。此次僅發布 GitHub Pages 前端，不部署 Worker、不跑 migration。
- 發布程序：核對 main 仍為 a4c58cc → 複驗相關測試 → 提交功能分支／PR → CI 通過後合併 main → 等待 Pages → 比對線上 HTML 與四個遊戲／商城模組的 Git blob 雜湊；最終版本於發布回報提供。
