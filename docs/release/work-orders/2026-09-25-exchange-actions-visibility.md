# 交流專區其他頁面操作可見性稽查

- 需求：其他頁面有相同按鈕不易看見狀況，稽查後修正。
- 起始／回復版本：8dde1911686bab738e37334a792997cf0482a310。
- 稽查範圍：我的聊天、找會員、個別對話、公開動態、我的貼文及既有子彈窗。
- 已確認：找會員與個別對話仍將重新整理置底。本次把同一按鈕分別移到業種篩選旁／返回列，處理窄螢幕與長姓名排版；公開貼文維持原功能，檢查關閉／管理操作可達。
- 瀏覽器重現：嵌入 320×430、獨立 320×500 對話傳送按鈕超出視窗。修正找會員來源的私訊頁首高度與獨立列表 min-height，保留完整姓名於文字/title。
- 允許檔案：member-chat.js/css、exchange-zone.js、index.html、相關 UI／瀏覽器測試、契約與工單（必要時僅補交流區專用 CSS）。
- 禁止：不改 API、搜尋條件、消息／優惠券／公開貼文權限、通知、會員、名片、點數、Worker 或資料庫，不擴大到商城或其他模組。
- 已讀：feature-change-protocol、change-work-order-template、exchange-top-tabs、exchange-post-visibility、member-chat-line-contact。
- guard before：PASS。
- guard after：PASS；member-chat-ui 17 項、兩個模組語法檢查、git diff --check 均通過。
- 瀏覽器測試：exchange-post-visibility（320／390／1440 寬）及 member-chat 獨立預覽均 PASS。另確認嵌入 320×430／390×430、獨立 320×500 的返回、關閉、重新整理與傳送按鈕可見；長姓名不溢出，搜尋條件保留且單次重新整理僅送出一次請求。
- 稽查結果：公開動態、我的貼文及子彈窗關閉／管理操作可到達；不更動其規則。測試使用本機模擬，未發送真實 LINE 訊息或修改正式資料；未進行實機 LIFF 驗證。
- 部署：沿用修正後直接部署授權，僅發布 Pages，不改正式資料。
