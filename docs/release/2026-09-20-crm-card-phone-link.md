# CRM 名片電話關聯工作單

- 需求：使用者同意新增管理員關聯名片、補空白電話；已授權提交部署。
- 起始／回復點：ee042cf。
- 範圍：獨立 Worker 模組、新增兩個 admin action、admin CRM UI、0042 新增唯增稽核表、對應測試與契約。
- 不動：名片認領／綁定、scanner/owner、推薦人、點數、登入、金鑰、既有會員批次資料。
- 已讀：core-invariants、card-resolvers、feature-change-protocol、crm-card-phone-link；guard before PASS。
- 高風險邊界：電話是聯絡及搜尋依據，提交端重新驗證空白、來源、重複及快照，無自動同名合併。
- 測試：合成 D1 SQL／權限／競態／前端核對；不使用真會員做寫入測試。
- 發布：Worker + Pages + 僅 0042 migration；保留 secrets/vars。
- guard before / after PASS；7 項後端測試、隔離瀏覽器核對流程、本機 workerd D1 交易與打包 dry-run 全部通過。
- 已唯讀比對正式欄位：users 無 updated_at，因此只更新 phone；操作時間存新增稽核表。正式資料未做試寫。
- Workers 安全實作技能：採用伺服器權限、綁定參數、交易、競態重新核對；Wrangler 技能用於打包及限定單一 migration。
- 已限定執行 0042 建表／索引，未補任何真人電話；Worker 版本 def28ed6-153d-4717-9c53-00caecabd004，保留既有 vars/secrets。Pages 隨本提交發布。
