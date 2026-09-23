# 商城列表讀取失敗最小修正

- 使用者授權：修正部署。起始 commit：a6f39c3416d144f08a2a31025ebd2e764d3037d8。
- 現象：正式 admin.html 目錄無法讀取；同一驗證的商品草稿顯示 LINE 身分驗證暫時無法完成。既有商品仍在 D1，不重建資料。
- 原因：本機 workerd（compatibility_date 2026-04-23）重現 Request redirect:error 不支援；Worker 在送到 LINE 前拋出例外。
- 允許：worker/store-admin.mjs 改用 manual，繼續拒絕非 2xx 回應；相關測試、商城契約與本工作單。
- 禁止：修改登入來源、管理員角色、UID resolver、會員、名片、點數、商品或訂單資料；不得放寬權限、修改 secrets/bindings、套用 migration。
- 已閱讀：docs/release/feature-change-protocol.md、docs/contracts/store-admin-directory.md、docs/contracts/store-admin-catalog.md、docs/rules/core-invariants.md。
- guard before：PASS（完整既有契約）。
- 測試：補上 manual 模式及 301/302/303/307/308 全數拒絕的防回歸；同步代上傳與 AI 開店測試對共用 LINE 驗證的期待值（AI 呼叫與開店功能不改）。執行商城相關測試、guard after、Worker dry-run。正式驗證僅讀列表，不新增或上下架商品。
- guard after：PASS（完整契約）。65 項商城目錄／代上傳／商品管理測試通過。共用驗證的 AI 開店 mock 同步後完整 guard 通過，未改 AI 功能。
- 本機 workerd：使用實際 authorizeStoreAdmin，成功 profile 可驗證；301/302/303/307/308 全部拒絕且不查資料库。只有合成憑證及本機資料，沒有對 LINE 或正式資料發測試寫入。
- Wrangler 4.136.3 dry-run --keep-vars：PASS，1240.68 KiB / gzip 269.56 KiB。git diff --check：PASS。
- 部署结果：待 PR CI 通過後部署；正式讀取驗收留於 PR。
- 部署：line-engine / worker-entry.mjs，使用 --keep-vars。只更新 Worker；前端與 D1 schema 無變更。
- 回復點：Worker 25dbbc88-7348-41ad-9675-a44cddb44b94；Git a6f39c3。無資料回復操作。
