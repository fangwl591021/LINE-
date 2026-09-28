# 活動 DM 重新辨識與梯次勾選

- 需求：補重新辨識；多時段逐項勾選並沿用系列梯次報名，修正後提交部署。
- 起點：dcb7198c534a0a0d954397cfae61be95ae7c2971。
- 範圍：admin 活動 AI 表單、既有 bulkAddRegistrants / activities 系列欄位與報名頁勾選；相關測試、快取版本與契約。
- 已查正式 schema（唯讀）：activities 已有 is_series、series_id、batch_name、batch_limit；沿用 activities / registrants，不增資料表或 migration。
- 禁止：改會員、金鑰、點數、商城、名片、正式既有報名紀錄；不自動轉換有報名的單場活動，不自動發布 AI 草稿。
- 已讀：feature-change-protocol、change-work-order-template、core-invariants、admin-activity-registration、liff-routes；Cloudflare / Workers best practices / Wrangler / API key 技能，金鑰沿用前次授權。
- guard before：PASS（%TEMP%/activity-dm-sessions-before.log）。
- 設計：AI 候選逐列核對勾選；建立系列時父子活動原子寫入、穩定 ID 重試；既有活動重新辨識先預覽再確認，另建系列需明確點擊，不覆蓋原報名。報名沿用現有 registrants，系列選項驗證歸屬／上架／LINE token 與容量，不信任前端價格。
- guard after：PASS（%TEMP%/activity-sessions-after.log）；60 項聚焦測試含並發建立／名單彙整通過。覆蓋原子建立／失敗回滾、穩定 ID 重試、身分與歸屬拒絕、資料庫價格、容量、重報、保留舊系列結構及複製。
- 瀏覽器：Chrome 真實 admin / index shell 搭配合成 API，320/390/1440px 通過；既有圖免重傳重新辨識、檔案替代、失敗重試、草稿確認、切換活動晚到回應、多梯次建立、報名勾選及原單場流程均通過。正式測試資料寫入 0。
- 名額不足可能部分梯次成功：逐項在交易內檢查，不超收；回傳明確部分成功訊息，已成功者保留，重試不重複。父活動報名列表彙整子梯次，顯示／匯出實際梯次活動名稱。
- Wrangler 4.142.0 dry-run PASS；保留既有 bindings / vars，無 migration，遠端金鑰僅確認名称。型別參照 Workers types 5.20260928.1；原子批次依 https://developers.cloudflare.com/d1/worker-api/d1-database/。
- 限制：AI 精準度仍需核對原 DM；最多 24 梯次；舊單場不自動轉為系列，另建系列須由管理員確認。既有系列結構不透過重新辨識覆寫。
- 部署：待 CI 通過後提交、合併及發布，線上比對 Git blob 與實際資源。
