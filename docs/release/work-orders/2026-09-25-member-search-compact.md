# 找會員移除重複設定

- 日期：2026-09-25。
- 需求：使用者確認連勾選也取消，設定已在我的聊天，不要在找會員重複占用空間。
- 起始／回復版本：d24edf8124afdddffad849c9fd4cc8cbe7341e99。
- 只允許：member-chat 前端切換時隱藏找會員內的整組設定與通知說明；保留我的聊天設定、搜尋／業種及會員列表；調整載入快取版本與相關測試。
- 預計檔案：js/modules/member-chat.js、js/modules/exchange-zone.js、index.html、test/member-chat-ui.test.mjs、test/browser/exchange-post-visibility.mjs、test/browser/member-chat.mjs 及本契約／工單。
- 禁止：不改偏好值、通知推送、API、登入、會員、名片、點數、Worker 或資料庫。
- 已讀：feature-change-protocol、change-work-order-template、exchange-top-tabs、member-chat-line-contact、core-invariants。
- guard before：PASS。
- guard after：PASS（完整 smoke contracts）；UI 14 項 PASS，JavaScript 語法及 git diff --check PASS。
- 合成 Chrome 320／390／1440px PASS：找會員設定、勾選、LINE 編輯與通知說明不可見；搜尋與列表正常；切回我的聊天可見且沿用已存偏好；切換沒有寫入偏好 API。
- 獨立私訊手機／桌面合成瀏覽器 PASS：登入讀取期間切換不露出重複設定；搜尋、業種、配對、POP、通知啟閉／持續保存／關閉頁面後合成 push 及既有訊息流程皆正常。未操作正式會員或發送真實 LINE 通知。
- 部署：依既有授權直接發布 GitHub Pages，無 Worker 部署、migration 或正式資料操作；完成後將精確版本與線上檔案核對證據記於 PR。
