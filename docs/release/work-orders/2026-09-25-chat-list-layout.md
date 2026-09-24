# 我的聊天列表優先排版

- 日期：2026-09-25。
- 需求：上方太占空間，參照 LINE 的聊天列表編排。
- 起始／回復版本：27ca660c48a024855ef236ed1d5f357ecc101c8c。
- 允許：我的聊天頁首縮減、設定與通知說明預設收合、白底連續聊天列、手機／桌面顯示；使用原 HTML details 控制，不新增依賴或 API。
- 檔案：member-chat.js/css、exchange-zone.css、exchange-zone.js、index.html、相關 UI／瀏覽器測試與契約。
- 禁止：不改聊天資料、排序、輪詢、權限、通知偏好、會員、名片、點數、Worker、資料庫或其他頁籤布局。
- 已讀：feature-change-protocol、change-work-order-template、exchange-top-tabs、member-chat-line-contact。
- guard before：PASS。
- guard after：PASS（完整 smoke contracts）；UI 15 項、JavaScript 語法及 git diff --check PASS。
- 合成 Chrome 320／390／1440px PASS：首筆聊天距頁首少於 180px、連續聊天列／未讀數保留、設定預設收合、Enter／Space 展開、捲動後仍可收合、390×500 短視窗保留聊天空間、返回後再收合、切換不寫入偏好。
- 獨立私訊手機／桌面瀏覽器 PASS：設定展開可使用原通知與加好友功能，通知偏好持續保存，其他搜尋／配對／聊天／優惠券／通知深連結測試通過。只使用本機合成資料，無真實 LINE 通知或正式資料操作。
- 部署：沿用修正後部署授權；只發布 GitHub Pages，不部署 Worker 或修改正式資料。精確發布版本及線上檔案核對證據完成後記錄於 PR。
