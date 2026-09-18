# 收藏名片配對百分比與排名

- 日期：2026-09-18
- 需求：參照 VEO 收藏名片百分比與最新收藏／配對排名，完成測試後直接提交、部署。
- 起始 commit / 回復點：1572c634418ff1463e9f02f98cc6825dae390444
- 修改前 guard：`node tools/run-change-guard.js before` PASS。

## 範圍

保留收藏與認領權限；只為已授權收藏列表附加目前登入者、目前已儲存業務需求、own 範圍、相同候選版本的既有配對結果。移植 VEO 最新／排名切換與百分比呈現，但明確說明 LINE 的分數是目前業務需求配對，不冒充 VEO 事業夥伴綜合分數。

修改檔案：workerbackup.js、worker/card-harvest-match.mjs、js/modules/cards.js、js/core.js（列表快取失效與錯誤保留）、index.html、test/card-harvest-match.test.mjs、test/card-harvest-match-ui.test.mjs、test/browser/card-harvest-match-preview.mjs、docs/contracts/card-resolvers.md、tools/run-smoke-contracts.js、3 個靜態測試的版本／函式簽名同步（含 test/store-admin-entry.test.mjs，不改店家權限）。

## 禁止變更

- 不修改身份解析、收藏歸屬、本人名片、公開池或歷史分數。
- 不觸發新的 AI 請求、排程或配額；不修改點數、分享獎勵、OCR。
- 不改 secrets、bindings、資料庫結構、LINE 關鍵字或商城。
- 不將任意搜尋歷史、別人分數、過期結果或假 0% 填入列表。

## 已讀合約

docs/rules/core-invariants.md、docs/contracts/card-resolvers.md、docs/data/card-ownership-and-versioning.md、docs/flows/ai-card-folder.md、docs/contracts/liff-routes.md、docs/release/feature-change-protocol.md。

## 驗證／發布

- 嚴格 actor／需求／版本隔離、AI／規則來源、缺資料降級、0 分、XSS、穩定排序、篩選與分頁、批次只讀。
- 修改後完整 guard、相關單元測試、diff check、Worker dry-run。
- 使用原 Worker／Pages 發布流程；保留變數；核對正式 Worker 版本、Pages commit 與實際資源。
- 不做任何真實贈扣點或 AI 測試寫入。

## 結果

- `node tools/run-change-guard.js after` PASS；新增後端 20/20、前端／core 整合 10/10。
- 原有收藏唯讀、增量配對、名片詳情五大標籤識別、uploader pipeline 通過。
- Worker／前端語法與 `git diff --check` PASS。
- Wrangler 4.134.0 `deploy --dry-run --keep-vars` PASS，1114.19 KiB（gzip 236.73 KiB）；不需 migration。
- 本機合成手機驗收：0%／75%／82%、排名、規則理由、Esc 關閉、分類＋搜尋均正常，無正式 API 或點數寫入。
- 審查補修：查看詳情回列表重新讀取缺少的查看者分數；目前本人需求修改使舊快取失效；structured API 錯誤不清空原名單。
- Worker 回復版本：2471b67c-3471-4bda-95db-b6435f2a099f；原 main 與 origin/main 一致，且 a934be7 之後無其他 Worker 變更。
- 結論：可依使用者授權提交、發布 Worker 與 Pages；正式版本與線上驗證於任務結果回報。
