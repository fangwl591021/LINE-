# 名片選圖與背面上傳等待修正

- 需求：客戶在選照片／上傳背面後等待過久。
- 起始 commit：3177e2a4d7ec333529f4b7aa8ca76cee0e09392a。
- 原因：原圖上傳、壓縮圖上傳串在預覽前；本機每請求延遲 2 秒時，正面預覽 4503ms、背面 4045ms。
- 範圍：收藏掃描 adapter、背景影像存檔任務、入口快取、相关流程契約與測試。
- 禁止：Worker、OCR 模型與呼叫數、會員歸屬、點數、正式資料修改、壓縮品質階梯。
- 已讀：web-perf 技能、ai-card-folder、既有 full-card-workflow 契約與 collection-sides 測試。
- guard:before：PASS（.wrangler/card-upload-guard-before.log）。
- 設計：本機壓縮完成即可預覽，原圖與壓縮圖背景保存；同一登入憑證完成影像任務；儲存前等候兩面存檔、失敗可重試、取消與換圖終止舊任務。
- guard:after：PASS（.wrangler/card-upload-guard-after.log），相關 20 個單元測試通過，full-card-workflow 契約亦通過。
- 慢網路驗證：390px Chrome、每張原照及結果請求各延遲 2 秒，正面預覽 4503ms → 153ms，背面 4045ms → 80ms。這是本機合成照片量測，並非客戶實機時間。
- 瀏覽器：上傳中可繼續核對、儲存等待兩面存檔完成、單筆寫入、核對欄位保留、同一次登入憑證、換圖／移除背面／取消中止舊任務全部通過。
- DevTools MCP 瀏覽器 profile 已占用，改以獨立 Chrome 的頁面時間與延遲请求量測；未蒐集客戶實機 trace。
- 部署：通過後僅 Pages。回復為 revert 此變更後重新部署。
