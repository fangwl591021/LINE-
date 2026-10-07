# 會員 DM 年份規則程式端保障

## 變更摘要

- 日期：2026-10-07；需求：昨天已指定未標年份採當年，今天要求修正並部署。
- 起點：LINE- origin/main 02393b143a0dc588b754af171cccf17092289401；分支 codex/member-dm-year-enforcement。
- 目標：後端校正 AI 回覆的年份，而不是僅依提示詞；台灣當年在請求起點固定。
- 預計檔案：worker/member-event-dm-schema.mjs、worker/member-event-dm.mjs、test/helpers/member-event-dm-output.mjs、test/member-event-dm-schema.test.mjs、test/member-event-dm.test.mjs、會員活動契約、本工作單。
- 僅部署既有 line-engine，沿用 OPENAI_API_KEY，--keep-vars；回復點為部署前確認的正式 Worker version。無資料 migration。

## 邊界

- 只新增內部 AI 年份原文證據和會員 DM 程式端年份校正；公開草稿欄位與前端確認套用流程不變。
- 禁止改官方 DM、名片辨識、身份/權限、報名/QR、私人行程、點數、附件、首頁、AI模型/重試/配額/金鑰、wrangler設定/bindings/crons。
- 不修改或重新發布既有活動，不向正式資料庫寫測試資料。
- 已讀 feature-change-protocol、change-work-order-template、core-invariants、member-hosted-events，以及昨天 current-year 工作單。

## 檢查

- guard before PASS（2026-10-07，完整 smoke contracts，exit 0）。
- guard after PASS（完整 smoke contracts，exit 0）。
- 回歸：無年但 AI 回 2025/2027、明示西元/民國、跨年、多時段、缺時/缺日、當年閏日、台灣跨年及 provider 等待跨年。
- Workers 實際 runtime 校正與有界來源證據測試；部署後核對版本、bindings/secrets/vars/crons與前端不變。
- DM 回歸 63/63；含會員活動、附件、首頁、官方 DM 回歸 107/107。官方 DM 規則及前端檔案未修改。
- Workers workerd（compatibility 2026-04-23）實際模組合成測試 PASS：無年 2025-10-15 改 2026-10-15，明示 2025 保留；一次 provider mock、一次本機配額寫入，無遠端 bindings。
- 1182056.jpg 真實 OpenAI OCR：隔離 remote preview 沿用既有 OPENAI_API_KEY、無 DB/KV/R2/schedules，HTTP 200，10928 ms，創新商業模式實戰分享會、2026-10-08T14:00–16:00、150 元及當年提醒。程序已停止，無正式活動/配額資料寫入。
- 瀏覽器實際前端模組＋合成後端輸出測試 PASS：「確認帶入草稿」前舊值 10/7，套用後開始 2026-10-15T14:30、結束 2026-10-15T17:00；只做合成測試，未發布活動。
- Wrangler 4.142.0 dry-run PASS；正確 line-engine、原有 bindings、--keep-vars。部署前版本 c149dfd8-e98e-40f9-a7e1-d3b4e9ffbadc（100%），作為回復點；不需資料或金鑰回復。
- 正式發版待完成合併及 CLI 部署；發版收據另存檢核證據。實體 LINE 手機與未提供原檔的 10/15 客戶 DM 未聲稱完成真實 OCR 驗證。
