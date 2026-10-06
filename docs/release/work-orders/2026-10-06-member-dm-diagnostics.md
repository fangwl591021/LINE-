# 會員辦活動 DM 安全診斷

日期：2026-10-06。使用者明確同意僅補 DM 辨識安全診斷並部署，沿用平台現有 OpenAI 金鑰。

此單為初始診斷階段；當時未部署。使用者後續同意移植 Smart-Menu-Studio 辨識方式，擴充範圍與發布紀錄以 2026-10-06-member-dm-structured-extraction.md 為準。

起始 commit / 回復點：68f780dfe3fbe5716f1ba75aa471c2cf650696e0；目前 Worker 8c992aa1-2068-4090-ae10-c1c3bad9e051。
獨立 worktree member-dm-diagnostics / codex/member-dm-diagnostics，不帶入 responsive-experience 未部署修改。

## 範圍與禁區

- 僅改 worker/member-event-dm.mjs 失敗診斷，以及對應契約、測試與工作單。
- 失敗回傳隨機診斷碼；伺服器只記錄固定流程階段、HTTP 狀態、允許清單內的 AI 錯誤分類與輸出長度。
- 不記錄檔案/檔名/原圖/base64、提示詞、AI 回覆文字、原始 exception message/stack、會員/聯絡/身分資料、headers、金鑰或供應商原始錯誤。
- 不改模型、provider、45 秒時限、資料解析成功路徑、會員驗證、配額、報名、活動發布、點數、名片流程或私人行程。
- 不改 Worker secrets/bindings/compatibility/crons，不跑 migration，不發布 Pages，不啟用全站請求紀錄。

## 契約與防護

已讀 feature-change-protocol、change-work-order-template、core-invariants、member-hosted-events。
guard before：PASS，日誌 member-dm-diagnostics-guard-before.log。
修改契約先於功能程式；失敗不得重試或改寫草稿，不增加業務資料寫入。

## 驗證與發布

guard after：待驗證。專項涵蓋成功不記錄、各失敗階段、診斷碼對應、任意秘密/個資不可洩漏、原子配額與零業務資料寫入。
部署僅 line-engine，keep-vars，從已核對的正式基準打包；部署前後比較 binding IDs / 非秘密變數雜湊 / secrets 名稱 / crons / compatibility。
正式確認部署版本、401/OPTIONS 原行為與 Pages 未更動。真實 AI 失敗根因需由使用者重測的診斷碼核對，不宣稱已修復辨識。
即時監看僅輸出 message=member_event_dm_failed 的安全 JSON，不保留原始請求/headers。
回復既有 Worker 版本即可撤除診斷，保留所有活動與報名資料。
