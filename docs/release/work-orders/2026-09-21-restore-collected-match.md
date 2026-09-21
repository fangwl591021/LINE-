# 收藏配對恢復：既有結果優先

- 起點 d46276e，分支 codex/restore-collected-match；guard before PASS（本任務尚未修改功能）。
- 使用者授權：恢復百分比、保護流程、提交部署；明確同意用既有 OpenAI 金鑰處理本人/收藏的公司、職稱、服務、個性/興趣/事業。最新修正：已有分數必須沿用，只有無紀錄的新名片補算。
- 唯讀正式診斷：own/AI 304 筆、own/rules 2041 筆。89dbe30 以目前 intent hash 與候選版本嚴格過濾，無需求直接 needs_intent，所以隱藏已存在的分數。
- 範圍：收藏結果讀取、無歷史結果的批次 AI 補算、前端百分比、測試及防退版契約；不變更會員、收藏歸屬、公開池、點數、遊戲、金鑰。
- 已讀：核心不變規則、card-resolvers、名片歸屬與版本、AI名片夾、LIFF路由、變更流程、Workers/Wrangler/OpenAI key 技能。
- 沿用同 actor/own/名片的有效歷史結果，舊需求結果標示「既有需求配對」，不假稱目前需求或新綜合分析。保留 0 分，區分 AI 與規則，無分數不可杜撰。
- 不自動覆寫既有分數。僅新名片補算；AI 使用既有服務與每日配額、分批五張、資料庫租約防雙分頁、失敗退避。只寫配對快取，無 migration。
- 查詢保持唯讀、名單先呈現；獨立 authenticated action 補算，不接受前端會員、候選名單、分數或金鑰。
- 新 AI 不傳電話、姓名、生日、健康、財富；標籤僅為參考，不當成人格事實。
- before PASS；after 完整 guard PASS（2026-09-21），47 項聚焦測試 PASS；涵蓋舊分數/真實零分、無需求、版本變更、跨會員隔離、雙分頁租約、失敗退避、實際 fetchAPI 解包格式。
- 桌面/390px 手機本機瀏覽器 PASS：AI 回應前保留 82%，回應後只新增 71%，排名/理由/日期正常；測試為合成資料，未呼叫正式 AI、未改正式分數。
- Wrangler 4.135.0 deploy --dry-run --keep-vars PASS，git diff --check PASS。無 migration，原有綁定/變數/金鑰不變。
- 修改檔案：worker/collection-match-history.mjs、workerbackup.js；js/modules/cards.js、js/modules/collection-match-auto.js、js/core.js（僅該 action 45 秒逾時）、index.html；相關三組單元測試與瀏覽器驗收、full guard 清單、card-resolvers 契約與本工單。
- 未驗證實機 LINE 登入及正式新卡 AI 回覆品質；已用真實 dispatcher + SQLite 和真實 core.fetchAPI 測試介面整合。新 AI 使用本人名片資料，不足時不捏造分數。
- 部署與提交識別於任務交付回報；只部署本修正，不修改會員、收藏歸屬、點數或正式歷史分數。
