# 恢復消費者首頁店家專區按鈕

- 需求：使用者更正上一項要求，恢復消費者首頁右上角「店家專區」按鈕。
- 起點：main e3470bd3d5b11f82239594c6e7ac68107924a12e；before guard 通過。
- 範圍：恢復 index.html 的原按鈕和既有點擊操作，並更新 DESIGN.md；沿用原有 CSS。
- 不更動：其他商城入口、店家權限、點數、交易、Worker 和資料庫。
- 已讀：AGENTS.md、DESIGN.md、feature-change-protocol、line-release-verification。
- 驗證：首頁按鈕及操作、320／390／1280 瀏覽器版面、完整 after guard、自動 CI、Pages 版本與線上首頁核對；實際手機 LINE 驗收另計。
