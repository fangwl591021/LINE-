# 刊登區塊只保留在我的貼文

- 需求：移除公開動態重複的會員交流動態刊登區塊，保留我的貼文內的刊登功能。
- 起始／回復版本：aaf0cc91a0ce4637e4b93c044ced6eb9973124fa。
- 範圍：交流區 CSS 顯示條件、index CSS 快取版本、相關 UI／瀏覽器測試及契約。
- 禁止：不修改貼文資料、篩選規則、會員身分、點數、通知、Worker 或資料庫；不更動其他頁面。
- 已讀：feature-change-protocol、exchange-top-tabs 契約及上一版交流頁籤工單。
- guard before：PASS。
- guard after：PASS（完整 smoke contracts）。
- 私訊 UI 相關測試 13 項 PASS；git diff --check PASS。
- 合成 Chrome 320／390／1440px PASS：公開動態隱藏整塊刊登區、我的貼文仍顯示、切回公開再次隱藏，公開貼文仍存在。原私訊切換、延遲回應、關閉及貼文隱藏／還原／刪除亦通過；無正式資料讀寫。
- 驗證：公開動態不顯示刊登區塊；我的貼文仍能顯示；手機與桌面切換、貼文管理及原私訊流程不受影響。
- 部署：依修好即部署授權，只發布 GitHub Pages；無 Worker 部署或 migration。測試及發布證據完成後記錄。
