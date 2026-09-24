# 交流專區上方四頁籤整理

- 需求：依提供的 LINE 範例，集中上方頁籤，移除分散且重複的導覽。
- 起始／回復版本：fa89212652d153dc4eaf3c931767ad4b61494c08。
- 範圍：index 交流區結構、新增交流區專用 CSS、exchange-zone loader/core、member-chat 的可選嵌入容器、UI／瀏覽器測試及快取版本。
- 禁止：不改 Worker、資料庫、會員／名片歸屬、點數、優惠券規則、推播收件人、通知排程、其他頁面。
- 已讀：feature-change-protocol、change-work-order-template、core-invariants、liff-routes、exchange-post-visibility、member-chat-line-contact；新增 exchange-top-tabs 契約。
- guard before：PASS。
- guard after：PASS（完整 smoke contracts，含新增頁籤結構保護）。
- 相關測試：私訊後端／UI／貼文可見性 58 項 PASS；JavaScript 語法及 git diff --check PASS。
- Chrome 合成整合：320px／390px／1440px PASS。四頁籤單列、固定捲動位置、私訊嵌入／無重複主導覽、名片／LINE POP 的 Escape、對話返回、快速切換忽略舊 import／API、通知深連結、關閉停止輪詢、未確認訊息取消／確認離開、貼文隱藏／還原／刪除皆通過。
- 390×500 短視窗：對話區允許壓縮、對話中省略重複通知說明（設定區仍保留），傳送按鈕在可視範圍。正常通知及權限未變。
- 原獨立私訊 Chrome 手機／桌面測試亦 PASS，涵蓋真實本機 handler、優惠券、配對分數、LINE 加好友與關閉收件頁後 mock 推播。無正式會員讀寫或實發通知。
- 發布後將於 PR 記錄精確 main commit、Pages workflow、線上檔案 SHA-256 驗證結果；不重部署 Worker。
- 部署：依既有修好即部署授權，只發布 GitHub Pages；Worker 維持 6d13a4f4-6d87-4275-abdf-e5b05eeeeaab，無 migration。
