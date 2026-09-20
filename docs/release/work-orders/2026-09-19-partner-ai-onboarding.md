# 收藏名片搜尋與 AI 開店

- 需求：名片太多難找；從名片、DM 或官網分析帶入店家資料，供人工修改。
- 使用者已確認沿用正式站現有 OpenAI 金鑰。
- 起始 commit：771c3e4633f0c97e2925b8f3a4968b5fe25cc9ee，main，工作目錄乾淨。
- 預計修改：新 onboarding Worker/UI、兩個 partner 後台整合、worker-entry、獨立用量 migration、測試與契約。
- 禁止：改 UID、名片歸屬/版本、點數、會員角色、LIFF、金鑰/bindings；不自動儲存/公開店家，不建立正式測試資料。
- 必讀：core-invariants、card-resolvers、phase-1-partner-directory、partner-onboarding-ai、feature-change-protocol。
- guard before：PASS（2026-09-19）。
- guard after：PASS；新增 27 項測試、既有完整 smoke contracts 通過。
- 瀏覽器：以實際 admin/LIFF 表單與模擬 AI、235 張假名片驗證搜尋、官網、圖片預覽及帶入；保留手動欄位與草稿狀態，手機寬 390px 無橫向溢出。未呼叫正式 AI 或建立正式測試店家。
- 部署：使用者已確認「直接提交、部署」；發布 Worker、Pages 及獨立用量表 migration 0041，不變更既有金鑰或其他資料。
- Wrangler dry-run：PASS。
- 回復點：上述起始 commit；新增用量表可保留，不刪除任何資料。
