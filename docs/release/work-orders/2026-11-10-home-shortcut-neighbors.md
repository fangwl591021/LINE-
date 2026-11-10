# 人脈島與交流專區移到我的名片旁

- 需求：使用者截圖指定首頁「人脈島」、「交流專區」移到「我的名片」旁。
- 基線：main c685684；完整before guard通過（repo外shortcut-before.log）。
- 範圍：僅新版會員首頁快捷列顯示排序，改成收藏名片→我的名片→人脈島→交流專區→收件夾→個人行事曆→星座運勢→加LINE好友；入口原handler、顯示資格判斷、hidden標記及未讀提示保留。
- 修改：home-discovery CSS加首頁非V2限定排序，保留原DOM及V2/舊樣式排序；index更新該CSS快取v3；同步DESIGN，視需要擴既有瀏覽器fixture。
- 不變：不改權限、路由、名片資料、角色、點數、API、Worker及其他頁面；不因位置調整強制顯示入口。
- 已讀：AGENTS、DESIGN、feature-change-protocol、core-invariants、line-release-verification技能及現有首頁測試。
- 驗證：完整before/after guard通過；首頁單元測試10/10通過；320/390/1280隔離瀏覽器確認實際矩形相鄰與格距、整頁無水平溢出、5個原handler目的地，以及原分類/點數操作；保留原hidden class，不把隔離預覽當正式資格驗收。證據為repo外shortcut-*.log及home-shortcut-order-browser.log。
- 發布：CI通過後合併發布Pages，再讀回index與CSS雜湊並核對正式帳號畫面；Worker不發布，前後版本比較留repo外shortcut-worker-*.json。
