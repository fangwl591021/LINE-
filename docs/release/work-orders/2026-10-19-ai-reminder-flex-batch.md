# AI 推進提醒合併多頁 Flex

- 來源：使用者要求不能浪費則數，2 則以上內容使用多頁 Flex。
- 起點：92eccdc17d8d00c0a18d15f894716f79dbc68e24；Worker 4f6575cd-88e0-46f6-935e-3f10d5a912b3；LINE- / line-engine / actmaster_db。
- 範圍：僅 AI 推進到期／本人手動提醒的持久合併、Flex、對應任務唯讀入口與說明；不合併不同會員，不動掃描結果、母站文字、私訊或其他通知。
- 自動到期先約 2 分鐘彙整同一會員，以一個 push、一個 Flex 發送；1 筆單卡，2–12 筆 carousel，更多時 11 筆頁＋查看其餘摘要。全部成員綁同一持久批次，不在下一分鐘重推摘要內任務。
- 頁面僅顯示待辦序號／期限與登入後查看按鈕；不把名片姓名、公司、任務標題／回報等私有內容放到 LINE 或鎖屏預覽。
- 每會員同時最多一個待確認批次，payload 與 retry key 固定；重試沿用原批次，跨排程與同時點擊防重，取消／延期／關閉提醒重新查核。已嘗試送出的舊單筆保留原 payload/key，不改成新 batch 重送。
- 0065 只加 batch_id 及批次表／索引，不更新原任務、偏好、已送出提醒；不套用其他 migration。
- 禁止：身份／歸屬、名片內容、點數／現場收銀／商城訂單、其他 LINE reply 擁有權、金鑰／綁定／cron 變更或無關通知。
- 已讀：core-invariants、ai-advance-crm-tasks、liff-routes、feature-change-protocol、change-checklist、change-work-order-template、regression-matrix；Workers/Wrangler skills。
- before guard：PASS；最終 after guard：PASS（完整 smoke contracts，含 33 項 AI 推進單元／UI 合約與 migration 保留測試）。
- 驗證：多任務只一請求、超過12頁摘要、不同會員隔離、兩分鐘累積、單筆、手動、並行、payload/key固定、送出後 DB 失敗、取消／延期／opt-out／身份衝突、舊工作相容、LINE 官方 validate（若現有憑證可用）、Workerd/D1、手機多寬度。
- 正式驗證僅讀取與 LINE validate，不製造真實提醒或通知其他用戶。實際手機收訊與伺服器／模擬驗證分開記錄。
- 已驗證：33 項單元／UI 合約通過，含 migration 原資料保留、300 筆摘要與失敗邊界；實際 Workerd＋D1 隔離測試通過；320/390/768/1200px 原 CRM 操作與 320/390/1200px 新 Flex 合成／任務連結測試通過。沒有可安全使用的本機 LINE 憑證，因此未呼叫 LINE validate；不宣稱手機實收完成。
- 回復：有未知／pending batch 時不可直接退回舊逐筆版；須先暫停 AI 推進提醒並查核既有批次，保留資料與 retry key，不能清空／重建通知。
