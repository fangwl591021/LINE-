# 會員辦活動 DM 結構化辨識

日期：2026-10-06。使用者於研究 Smart-Menu-Studio 後明確要求「好，開始」，授權移植 DM 專用模型、固定欄位與人工確認；沿用平台現有 OpenAI 金鑰。

正式起點：68f780dfe3fbe5716f1ba75aa471c2cf650696e0，line-engine / 8c992aa1-2068-4090-ae10-c1c3bad9e051（100%）。參考來源 Smart-Menu-Studio / f69fd70a2ff91056bbac158a41e046ee35f10077。

## 範圍

- 僅 worker/member-event-dm.mjs、新的 worker/member-event-dm-schema.mjs、DM 專項測試（含 test/helpers/member-event-dm-output.mjs）、tools/run-smoke-contracts.js、member-hosted-events 契約與工作單。
- 合併前次已獲同意但未部署的失敗安全診斷；diagnostics 工作單是當時的範圍，本單授權擴充為辨識實作。
- 活動入口已知道是 DM，直接使用 gpt-5.6-sol / reasoning low / strict json_schema，不做額外分類呼叫。沿用既有 OpenAI 直連，不加 MLM 服務綁定，不移植旅遊資料庫。
- 固定欄位含活動名稱、時間原文、起迄、梯次、地點、說明、類型、費用、不確定提醒與 rawOcrText。依伺服器結構檢查後才送回現有預覽、人工帶入與人工發布。
- 45 秒時限、4000 輸出 token、15 秒/每日20次原子配額維持不變；拒絕、不完整、超限或格式錯誤不套用、不自動重試。
- 優先辨識四核心內容；rawOcrText 作附加原文最多3000字，不以長篇逐字稿擠掉核心資料。內容不足時留空、不可猜日期/費用。
- 不改名片/官方活動/報名/私人行程/身分/點數；不更換金鑰、bindings、crons、compatibility，不跑 migration，不改 Pages 前端檔案。PR 合併若觸發既有 Pages CI 重新打包，須核對原前端內容雜湊不變。保留 responsive-experience 未部署變更。

## 契約與驗證

已完整閱讀 feature-change-protocol、change-work-order-template、core-invariants、member-hosted-events；guard before PASS（member-dm-schema-guard-before.log）。契約先改再實作。
測試：請求模型/schema/無分類、圖片/PDF、成功與格式錯誤、回應兩種文字格式、拒絕/不完整、型別/未知欄位/長度、未知日期費用、多場、未登入/偽造、取消、原子配額、安全診斷、零業務資料寫入；專項44/44 PASS（member-dm-schema-tests.log）、guard after PASS（member-dm-schema-guard-after.log）。dry-run PASS（member-dm-schema-dry-run.log）。
Workers runtime mock PASS（member-dm-schema-runtime.log），使用本機已安裝 Wrangler4.147.0 所附 Miniflare、正式 compatibility 2026-04-23 / flags []，無 remote bindings，驗證實際模組可辨識mock供應商結果、一次AI呼叫且只有配額寫入。
部署前 dry-run；正式前後核對版本與 binding/secret-name/非秘密變數雜湊/crons；匿名401/OPTIONS與Pages不變。真實AI與手機實測另外標記，不以mock取代。

## 回復

回復 Worker 8c992aa1-2068-4090-ae10-c1c3bad9e051；無資料或secret變更，無需刪除活動/報名資料。
