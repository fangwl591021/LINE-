# 首頁跑馬燈移位

- 需求：跑馬燈置於綠色會員資訊列與功能按鈕區之間。
- 起始 commit：fad679de3640c7e200e65b3b773aff0fe764903f。
- 範圍：index.html 的既有 ticker 節點位置，更新既有首頁順序契約／測試邊界。
- 禁止：跑馬燈資料、動畫、購物金、簽到、按鈕事件、Worker 與會員資料。
- 已讀：feature-change-protocol、check-home-design-contract、home-reference-theme 測試。
- guard:before：PASS（.wrangler/home-ticker-guard-before.log）。
- guard:after：PASS（.wrangler/home-ticker-guard-after.log）。
- 手機驗證：390px／560px Chrome，以實際首頁區塊及樣式確認會員列 → 跑馬燈 → 功能區；截圖保留於 .wrangler/home-ticker-mobile.png。
- 部署：通過後提交並發布 GitHub Pages。
- 回復：revert 此變更後發布 Pages。
