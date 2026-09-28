# 活動 DM 核心欄位辨識

- 需求：使用者要求以活動名稱、時間、地點、活動說明為辨識重點；沿用先前已同意的 OpenAI 金鑰及修正後直接部署授權。
- 起始／回復點：608c754126993db195ce2fb5f29e2eaf86ff775f；Worker 部署前核對線上版本。
- 範圍：worker/activity-dm-ai.mjs、js/modules/admin-activity-registration.js、admin.html 快取版號、對應測試與契約。
- 行為：單次既有高解析 AI 擷取四項核心資料，保留活動時間原文、減少改寫；多場次／不明時間不預選，明確提示人工確認。新增表單獨立地點欄位，儲存仍沿用活動說明，不改資料庫。只產生草稿，人工確認後才建立。
- 禁止：不改會員／LINE 驗證、名片／商品 OCR、點數、報名、分享短網址、AI 模型／金鑰、資料庫／migration 或其他商城功能；不新增 OCR 供應商。
- 已讀：feature-change-protocol、change-work-order-template、core-invariants、admin-activity-registration；Cloudflare / Workers best practices / Wrangler / API key 技能。
- guard before：PASS（%TEMP%/activity-dm-core-before.log）。
- guard after：PASS（%TEMP%/activity-dm-core-after.log）；與 before 皆為完整防退版檢查。
- 單元：node --test test/activity-dm-ai.test.mjs test/admin-activity-registration.test.mjs test/activity-short-links.test.mjs，39/39 PASS。涵蓋單場／跨日／多場次／模糊時間、缺漏提示、原文保留、地點合併既有說明、權限／失敗／逾時、既有報名短網址。
- 瀏覽器：node test/browser/admin-activity-registration.mjs，Chrome 合成資料 320/390/1440px PASS；四項核心預覽、地點可編修、多場次留空待選、人工確認與原新增／重試／AI／名單／短網址回歸均通過，正式資料寫入 0。
- 語法／差異：Worker 模組、後台模組 node --check、admin inline scripts 解析、git diff --check 通過。
- Worker dry-run：Wrangler 4.142.0，PASS（%TEMP%/activity-dm-core-dry-run.log）。既有遠端 OPENAI_API_KEY 僅查名稱確認存在，不取值；Workers types 5.20260928.1 核对既有 AbortController。無更改平台設定或依賴。
- 部署前 Worker：5d459a83-0479-4be6-9a26-bd6e3427697c（活動短網址既有版本）。發布與線上檔案核對證據留 PR。
- 部署：既有 line-engine Worker（保留 vars/secrets/bindings）與 GitHub Pages；不執行 migration，不建立正式測試活動。
- 限制：合成資料測試不能證明真實 DM 準確率；無新增原始失敗 DM，不宣稱已量測辨識率提升。
