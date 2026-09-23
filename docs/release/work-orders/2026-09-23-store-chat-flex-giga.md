# 店家專區衍生聊天室 Flex 字級

- 日期：2026-09-23；起始 commit：1093bc0；回復點：1093bc0。
- 使用者確認：只放大店家專區衍生聊天室卡片，不包含我的電子名片；測試後提交、部署。
- 允許檔案：worker/store-line-keywords.mjs、test/store-line-keywords.test.mjs、docs/contracts/line-keywords.md、本工作單。
- 範圍：我的商品（含翻頁）、我的網購訂單（含翻頁）、我的業績、商城儀錶板、商城登入提示，沿用店家專區 GIGA、XL 標題、LG 內文與可換行操作文字。
- 禁止：電子名片及其分享、QR 推薦、活動、其他 Flex、自訂模板、全域 reply/push/LIFF 傳送；會員、點數、資料表、LINE 回覆歸屬、既有 action、權限、Worker 設定與金鑰。
- 已讀：feature-change-protocol、line-keywords、button-actions、core-invariants。
- 實作：僅商城私有 card helper 套用既有店家專區樣式，移除未發布的全域放大草稿；不新增共用轉換器。
- guard before：PASS（1093bc0，原草稿修改前）；縮限前的完整 guard after 亦 PASS。
- 驗證：20/20 商城測試 PASS（含三個實際共用 LINE sender 使用假 fetch，電子名片 payload 完全不變）、完整 guard after PASS、Wrangler 4.136.3 deploy --dry-run --keep-vars PASS、git diff --check PASS。
- 本機合成資料 320px 近似預覽：商城標題 22px、內文 19px、長文字可換行、無水平溢出。電子名片與 LIFF 分享實作對 1093bc0 零差異；並未改成全域樣式。
- 發布：驗證通過後部署 line-engine，保留既有 vars/bindings；不操作正式點數或發送測試訊息。
- 限制：既有聊天室訊息不會更新，需重新輸入指令；本機測試不等同手機 LINE 原生畫面實測。
