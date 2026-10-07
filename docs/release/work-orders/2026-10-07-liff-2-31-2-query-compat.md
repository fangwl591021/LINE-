# LIFF 2.31.2 升版與參數相容修正

## 1. 變更摘要

- 日期：2026-10-07。
- 需求：使用者核准「升版＋參數相容修正」。
- 起始 commit / 回復點：17c46aebbeda725741569184def53fb2634a99ac。
- checkout：member-dm-diagnostics；origin：fangwl591021/LINE-。
- 部署：僅 GitHub Pages，不部署 Worker。

## 2. 本次只允許改什麼

- 五個固定版 LIFF 入口由 2.22.3 升至 2.31.2；既有 edge/2 入口維持自動更新政策。
- 主入口及 point-bridge 的巢狀 query 解析：不重複解碼參數值，保留舊式雙重編碼路由。
- 更新 config.js 快取版號、針對性測試與 CI regression guard。
- 預計檔案：index.html、admin.html、admin-v2.html、point-bridge.html、ocr-lab.html、js/config.js、tools/check-main-liff-endpoint-contract.js、tools/run-smoke-contracts.js、test/liff-query-compat.test.mjs、唯讀瀏覽器測試及本工作單。

## 3. 本次禁止碰什麼

- 不改 LIFF ID、OAuth / init 時序、UID resolver、推薦人與歸屬規則、分享與傳送路徑、報名權限。
- 不改名片 OCR、名片 owner / scannedBy / 版型、會員資料、點數 ledger。
- 不改 Worker、D1、R2、bindings、secrets 或 LINE reply ownership。
- 不修改 LIFF Console 設定，不建立會員、活動、名片或點數交易供測試。

## 4. 影響流程

- LIFF route、分享 / 報名 / 店家歸屬網址、既有購物金橋接頁。
- 五個入口的 SDK 載入；不改各入口業務邏輯。

## 5. 修改前必跑

`node tools/run-change-guard.js before`：PASS（功能修改前完整 smoke contracts，exit 0）。

## 6. 必讀規格

已讀：core-invariants、liff-routes、my-card、ai-card-folder、card-ownership-and-versioning、card-resolvers、button-actions、points-ledger、regression-matrix、feature-change-protocol、change-checklist。

## 7. 不變規則確認

- 既有 outer query 優先權與 a/r/n/v/c/s alias 不變。
- 網址中的 UID、ref、net 不作身分或權限授權；橋接 dropKeys 與 profile UID 寫入規則不變。
- 同一個網址值內的 ? / & / + / % / # 不溢出成外層參數。
- 不在 liff.init 完成前修改瀏覽器 URL，不覆寫正式 window.liff。

## 8. 實作紀錄

先由 URLSearchParams 解碼最外層 query；只對沒有明文 query delimiter 的舊式完整編碼路由額外拆一層。巢狀 query 再交 URLSearchParams 解碼各值一次。以第一個出現在等號前的 ? 判斷路徑邊界。

## 9. 修改後必跑

- 針對性測試：PASS，111/111（query compatibility、login bootstrap、store invite、point operation entry）。其中新增參數 / SDK 合約 52 項。
- `node tools/run-change-guard.js after`：PASS，完整 smoke contracts，exit 0。

## 10. 人工驗證

- 瀏覽器唯讀解析：48/48 PASS；真實 SDK 的 getVersion() 回傳 2.31.2。主入口及橋接頁均以 iframe 的真實 location.search 執行正式 parser，不觸發 LINE OAuth 或實際寫入。
- 瀏覽器截圖：本機忽略區 .wrangler/liff-compat/browser-pass.png；唯讀測試 tab 已關閉，loopback server 已停止。
- 真實 iOS / Android LINE 二次重新導向需裝置驗收，不以桌面模擬冒充。

## 11. 上線判斷

本機前 / 後 guard 與瀏覽器參數測試均通過；範圍符合第 2 節，未碰第 3 節。經 PR CI guard 通過後，合併並部署 GitHub Pages，核對正式 SDK URL、config 快取版本及各修改檔案內容；部署回條記錄於 PR。

回退：若實機相容性異常，以本次合併 commit 的 revert 回到起始建置；不需資料庫回復、金鑰變更或 Worker 部署。
