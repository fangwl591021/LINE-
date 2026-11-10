# 商城逐件公開與疑義紅字

- 需求：369健康嚴選可通過者公開；有疑義者保留草稿並顯示紅字具體原因。
- 起始：e04ac80。限定商城管理之審核回饋；不改審核政策、身分、方案名額、點數、交易、價格、圖片或原商品內容。
- 已讀：core-invariants、store-admin-catalog、store-listing-review、store-shop、feature-change-protocol、line-release-verification。
- before：完整 `npm run guard:before` PASS（本機記錄位於 repo 外）。
- after：最終完整 `npm run guard:after` PASS，含新增feedback測試（本機記錄位於repo外publish-guard-after-final.log）。
- 實作：管理員查詢回傳本版商品／店面最近未通過的審核摘要；清單與編輯器紅字顯示；儲存確認改用頁內明確確認以避免原生對話框卡住。
- 仍須原上架審核、角色、CAS、request_key及原子audit；沒有免審或直接DB公開入口。不自動修改或送審任何資料。
- 待驗證：拒絕／人工核對摘要及舊版本隔離、權限、重載顯示、取消／重送／未知結果、320/390桌面版面、完整after guard。
- 已驗證：原catalog與新feedback共35項；listing-review與單品限定放行35項；入口與新feedback19項。新增紅字UI、admin-mall-linked、單品限定放行三套Chrome合成流程皆PASS，涵蓋320／390／1440、取消零寫入、同鍵重試、成功清錯誤與零native dialog。實際local HTTP整合也確認審核退回後重載列表仍有紅字且390無橫溢。
- 審核政策及所有POST寫入流程未變；新feedback測試納入full guard。live Worker 9b4d145e對照origin/main e04ac80 bundle逐位元一致，發布沿用原資源並以keep-vars保留Dashboard額外開關。
- 發布：測試通過後只發布本次Worker及Pages；核對正式讀回，再逐件使用正常管理入口處理已授權店家。
