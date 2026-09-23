# 商城管理連動正式發布

- 使用者最新授權：提交、部署。先前工作單的「未部署」為實作完成當時狀態。
- 來源：LINE- 正式 checkout，起始 main / origin/main 均為 23b629733e57d455853da24648c1a1ae6a9bb9fa。
- 範圍：見 2026-09-23-mall-admin-linked.md。只發布商城 admin / 手機連動、全站商品草稿及圖片編輯，不搬入福委會資料。
- Worker：line-engine，worker-entry.mjs。D1：ACTMASTER_DB / actmaster_db / 8a0107f9-000d-4810-b6bf-5d599b699195。
- Pages：GitHub 設定核對為 main 根目錄，https://fangwl591021.github.io/LINE-/。
- 依 Wrangler skill 使用 4.136.3，deploy --dry-run --keep-vars 通過：1240.59 KiB / gzip 269.47 KiB。保留 vars、secrets、bindings、compatibility_date，不更動正式設定。
- 完整 guard before / after、33 項相關測試與合成瀏覽器 320 / 390 / 1440px 測試先前通過，本次發布前再跑 after PASS。
- migration 清單有 0042、0043、0045；僅直接套用已審閱的 0045_store_catalog_admin_audit.sql，再確認 schema 並記錄這一筆 migration。不得批次 apply 其他 migration。
- 0045 只新增稽核表及索引，不更新既有店家、商品、會員、點數或訂單資料。
- 發布順序：專用分支 commit / PR → CI → 0045 → Worker --keep-vars → 合併 PR → Pages → 正式資產雜湊及唯讀路由／未登入拒絕驗證。
- 發布前 Worker 版本：0b8f1305-a8b9-4fcb-a743-a77fb99a3d42。回退只退程式，不刪稽核表；舊版忽略此新增表。
- 不使用真實會員進行測試上架、下架、上傳、贈扣點；正式登入後操作仍需管理員驗收。圖片上傳後取消可能留下未引用 R2 物件，沿用既有行為，不加刪除流程。
