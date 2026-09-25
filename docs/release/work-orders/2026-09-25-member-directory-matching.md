# 找會員自動補配對與排名

- 起點 a76104ff6be1555e580807412d5cca9e3b7b8f4b；使用者要求補足缺漏、新會員持續配對及排名切換，沿用既有金鑰與直接部署授權。
- 原因：會員目錄僅取本人收藏的舊分數，沒有目錄補算流程。
- 範圍：會員目錄補算、最新名單／配對排名、相關契約與測試；禁止改身份 resolver、名片權限/歸屬、收藏歷史、點數、商城或 LINE 通知邏輯。
- 舊分數優先；新分數僅使用目錄已顯示的公司與職稱摘要，不讀取或外傳私人電話、Email、服務、標籤或名片詳情。沒有足夠資料不捏造分數。
- 沿用 ai_match_pair_cache，獨立保留目錄 intent 命名空間；新增會員級背景工作表，開啟找會員時登記，由既有排程分批續補新名單，保留配額與失敗退避；不做全站會員互配。
- 已讀：feature-change-protocol、card-resolvers、card-ownership-and-versioning、core-invariants、exchange-top-tabs；Workers/Wrangler/OpenAI key 技能。
- guard before／after：PASS。私訊與 UI 聚焦 62 項測試 PASS；涵蓋舊分數/0 分、新會員背景續配、租約與失敗退避、私人欄位不傳 AI、全池排序/分頁、配額與未授權請求。
- 手機 320／390、桌面 1440 瀏覽器 PASS；實際本機 SQLite＋模擬 AI 驗證 82% 不變、只補缺漏的 93%、排序與搜尋/業種保留。並重跑既有聊天、附件、名片 POP、通知、隱藏貼文回歸。非實機 LIFF，未呼叫正式 AI 或傳送真實私訊。
- Wrangler 4.137.0 --dry-run --keep-vars、語法檢查與 diff check PASS。既有 OPENAI_API_KEY 名稱確認存在，未讀出金鑰；沿用既有模型與每日 20 次 matchmakeContacts 配額，每批最多 20 位。
- 修改：member-chat.mjs、新增 member-chat-matching.mjs、Worker entry 與既有 AI 模組薄封裝；member-chat.js/css、入口快取版本；0050 migration；相關契約／測試。僅使用目錄公司/職稱摘要，未改公開名片或收藏資格。
- 第一次重新開啟找會員後登記個人補算工作；其後離頁也由 cron 接續處理。資料不足不製造分數；配額不足／AI 故障會顯示狀態並延後續配，不承諾即時完成全量。
- 正式回復 Worker：6d13a4f4-6d87-4275-abdf-e5b05eeeeaab；保留新表及已生成快取不刪除。正式待執行 0042／0043 不屬本次，只隔離套用 0050。
- 部署：最小 additive migration、Worker --keep-vars、Pages；不得套用其他待執行 migration 或發送真實私訊。
