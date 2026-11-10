# 註冊產業預設服務業

- 需求：註冊產業預設不要LINE OA，改為服務業。
- 基線：main 476ec96；完整before guard通過，證據保存在repo外industry-before.log。
- 範圍：註冊表單主要業種預填服務業；新建會員未提供產業時預設服務業；LINE OA自動建檔、快速/備援索引、修復候選及純查詢空值fallback統一使用服務業。
- 保留：使用者自行填寫及既有會員產業（包含舊LINE OA）；不批次修改正式會員，不改角色、UID、推薦人、註冊資格、點數/獎勵、來源標記、交易或排程，不執行修復工具或真人註冊驗收。
- 已讀：AGENTS、feature-change-protocol、core-invariants、auth-stability-contract、points-ledger、line-keywords及line-release-verification技能；使用workers-best-practices與wrangler技能核對發布。
- 預期檔案：workerbackup.js、index.html、既有member-shopping-credit測試及認證契約；僅預設值，無schema/config調整。
- 驗證：完整before/after guard通過；認證穩定檢查通過；註冊生日、公開角色邊界、活動註冊及會員編號共56項測試通過；member-shopping-credit 13/13通過（保留原6項、新增7項真SQLite測試），確認新建缺值、自填優先、既有產業/角色/點數保留、快速/備援索引、webhook重送與只讀查詢。Worker dry-run通過。
- 發布：CI通過後合併並發布Pages及Worker，使用keep-vars保留既有設定；部署前已讀回正式bundle、設定與排程，D1/KV/R2綁定均與wrangler相符。部署後核對正式bundle及設定/排程，證據留repo外industry-*。未操作真人註冊、修復工具、正式點數或交易。
