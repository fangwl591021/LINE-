# 店家專區 Flex 文字放大

- 日期：2026-09-23；使用者要求文字放大，並明確授權直接提交、部署。
- 起始 commit：047cca49dfa9dda5baf5aa5d543edb8193d4b4f3。
- 範圍：僅店家專區 giga 卡片。標題 lg → xl；內文 sm → lg；按鈕以可點擊 box/text 顯示 lg，保留所有原 action、順序、標籤與 URI。
- 保留：既有 giga 寬度、深藍標題、灰色按鈕、內容及換行。不改其他商品／訂單／業績卡片字體。
- 允許檔案：worker/store-line-keywords.mjs、test/store-line-keywords.test.mjs、docs/contracts/line-keywords.md、本工作單。
- 禁止：身份／角色／webhook 路由或回覆歸屬、資料查詢、會員、點數、訂單、商品資料、正式設定與金鑰；不發送真實測試 LINE 訊息。
- 已讀：feature-change-protocol、line-keywords、core-invariants。依 Workers 最佳實務將變更侷限在訊息 JSON 顯示；Wrangler 部署保留 vars/bindings。
- guard before：PASS。
- 驗證：字級、所有 action 保留、其他卡片樣式不變、長商品名換行及訊息大小、完整 guard after、dry-run。
- 部署：line-engine / worker-entry.mjs；不需 migration 或前端資產修改。回復版本 c0789c49-438c-4cca-a65a-d549d52f018f。
- guard after：PASS；node --test test/store-line-keywords.test.mjs：19/19 PASS；node --check 與 git diff --check：PASS。
- Wrangler 4.136.3 deploy --dry-run --keep-vars：PASS，1241.20 KiB / gzip 269.82 KiB，原 bindings 保留。
- 本機合成資料 360px 卡片預覽：五個操作文字完整、橫向溢出 0。此預覽並非原生 LINE，未發送真實訊息。
- 發布：測試完成，待 PR / CI 與正式部署；部署版本記於 PR。已發出的 LINE 卡片不會更新，部署後須重新輸入「店家專區」取得新版。
