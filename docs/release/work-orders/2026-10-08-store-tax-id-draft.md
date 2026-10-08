# 我的店面：統編查公司與 AI 草稿

## 1. 變更摘要
- 日期：2026-10-08；需求：統編可獨立查詢，不先填名稱／區域。
- 起始 commit：c2cf8f69981a9ba457fff716a6cbcc3fd1c3d07e。
- 修改：store-ai-draft Worker/UI、固定官方登記查詢 helper、管理表單、載入版本、相關契約與測試。
- 部署：本機驗證完成後，使用者於 2026-10-08 明確要求「部署」；只部署本工單範圍。前端回復點為起始 commit，Worker 回復版本 ac3cced2-45ba-47f0-a63c-5fc67173f75d。

## 2. 本次只允許
- 8 位統編先直接查經濟部登記資料；名稱可留白。
- 快速登記預覽與選擇性 AI 補充；名稱／登記地址不依賴 AI 或 HTML 重讀成功。
- 保留原有六欄、明確勾選帶入、人工修改優先、最後既有儲存流程。

## 3. 禁止
- 不改 LIFF／登入、角色／UID／owner、商品／公開狀態、點數／交易、金鑰／綁定／資料庫 schema。
- 不自動保存、公開或修改既有店面。統編只是查詢條件，不能用來認領公司或授權。

## 4. 影響流程
- 只影響「我的店面」草稿查詢；不改名片、會員活動、後台 admin onboarding。

## 5. 修改前
- node tools/run-change-guard.js before：PASS，完整記錄 .wrangler/store-tax-id-guard-before.log。

## 6. 必讀契約
- core-invariants、store-shop、store-ai-draft、feature-change-protocol、regression-matrix。
- 官方 API 文件：https://data.gcis.nat.gov.tw/od/rule。
- 官方 API 有來源 IP 介接政策；不得绕過拒絕，必須顯示不可用而非「找不到公司」。本機已實際取得 24456660 正確資料；正式 Worker 可用性仍待部署驗證。

## 7. 不變規則
- 原 actor 驗證、角色、本人範圍、保存版本、六欄白名單不變；統編不持久化／不作身分。
- 原 AI quota 20/day、15秒不變；固定官方查詢另以 store-lookup:UID 限流 60/day、3秒，使用既有 usage 表。

## 8. 決策
- 官方只給有證据的欄位，未提供電話／時間不補造；登記地址未必為店面地址，需核對。
- 官方網路／IP／格式故障和查無資料區分；錯誤日志只記安全階段／診斷碼。
- AI 補充失敗保留已查證的名稱與登記地址，不把它們清空。

## 9. 修改後
- 67/67 focused tests：store-ai-draft、UI、partner-onboarding-ai。
- node tools/run-change-guard.js after：PASS（曾因四個舊 cache-version 常數失敗，僅同步測試期望版本，不更改其權限／交易断言）；完整記錄 .wrangler/store-tax-id-guard-after.log。
- Wrangler deploy --dry-run --keep-vars：PASS，只打包，未發布；config／bindings／secrets 未改。
- git diff --check：PASS。

## 10. 人工驗證
- 實際 Miniflare/workerd，compatibility 2026-04-23 / flags=[]，向官方 API 查 24456660：HTTP200，正確名稱／登記地址，單次 608ms；不使用任何 credential／正式 DB。不是正式 Worker 延遲保證。
- 隔離 loopback 瀏覽器：名称、區域留白，統編單填取得預覽；明確勾選帶入兩欄，analyses=0 / saves=0。
- 320px／390px frame：html scrollWidth 等於 clientWidth，無橫向溢出；已有欄位預設不替換；預覽後手動地址保留，saves=0。
- malformed / wrong-ID / duplicate / unauthorized / non-JSON / oversized / redirects / timeout / HTTP200 IP拒絕／查無資料：測試通過且不寫店面。
- AI 失敗、曖昧與錯誤事實不清除官方基本資料；營業項目來源可支持介紹／業種，無來源電話／時間排除。
- 本機預覽：.wrangler/store-tax-id-preview.jpg；測試不讀写正式店面。

## 11. 上線判斷
- 本機完成且已取得部署授權；發布前重新執行完整 guard 與 67 項 focused tests，均 PASS。部署後另驗證正式 Worker 能否依官方 IP 介接政策查詢，不能將本機成功當作正式端成功。實際版本、發布結果與人工驗證記錄於 PR release receipt。
