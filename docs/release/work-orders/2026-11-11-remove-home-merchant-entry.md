# 移除消費者首頁標頭的店家專區按鈕

- 需求：使用者要求移除消費者首頁右上角的「店家專區」。
- 起點：main b6888ff4f1edfb3f0e38a43f7eb3fa1dd569c56a；before guard 通過。
- 範圍：刪除 index.html 中會員首頁標頭的單一按鈕，並更新 DESIGN.md；維持品牌標頭與既有版面。
- 不更動：其他店家或商城入口、角色權限、點數、交易、Worker 及資料庫。
- 已讀：AGENTS.md、DESIGN.md、feature-change-protocol、line-release-verification。
- 驗證：首頁樣式及 320／390／1280 瀏覽器版面、完整 after guard、自動 CI、Pages 版本與線上首頁核對；實際手機 LINE 驗收另計。
