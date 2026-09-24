# 我的聊天重新整理移至設定左側

- 需求：右下角重新整理看不到，移到設定左邊。
- 起始／回復版本：1ebd0663308ad37ece9884851793dd3082650282。
- 範圍：重用原按鈕，在我的聊天移到設定左側；其他頁面移回原位；調整專用樣式、快取版本及相關測試。
- 檔案：member-chat.js/css、exchange-zone.js、index.html、test/member-chat-ui.test.mjs、test/browser/exchange-post-visibility.mjs、test/browser/member-chat.mjs、契約與工單。
- 禁止：不改資料、API、通知、會員、名片、點數、Worker 或資料庫；不新增重複按鈕或刷新服務。
- 已讀：feature-change-protocol、change-work-order-template、exchange-top-tabs。
- guard before：PASS。
- guard after：PASS（完整 smoke contracts）；UI 16 項、JavaScript 語法及 git diff --check PASS。
- 合成 Chrome 320／390／1440px PASS：按鈕唯一、位於設定左侧同列、44px 觸控高度、列表捲動不移位；登入讀取失敗可重試；鍵盤重新整理只有一次讀取且不誤開設定，設定展開時重新整理不收合；找會員／对話頁保留原操作。
- 獨立私訊手機／桌面合成測試 PASS，涵蓋重新整理、通知、LINE 加好友、對話、返回及原權限流程；無正式資料或真實 LINE 訊息。
- 部署：既有修正即部署授權，只發布 Pages；正式資料不變。
