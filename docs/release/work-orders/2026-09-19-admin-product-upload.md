# 管理員替註冊店家上傳商品

- 需求：新增系統能幫註冊店家上傳商品機制。
- 基準：main / cf03792e79423d9697273f30eaf386b3de807e7e。
- guard before：PASS。部署：使用者已明確要求「提交、部署」（2026-09-19）。
- 範圍：管理員店家列表新增代上傳入口、獨立新增商品 API、0040 代建稽核表、回歸測試與前端版本。
- 禁止：不變更會員身分、店家 owner、邀約、點數、訂單、付款、既有商品或 owner-only API；不替未註冊樣板店家建商品。
- 後端沿用已驗證 LINE 身分及既有管理員映射，目標依 shop_id 查詢，不接受 owner_uid。商品件數／通路限制依目標負責人。
- 管理員可新增草稿（預設）或明確上架，店家維持原公開狀態。商品與 actor/owner/內容快照稽核同一 D1 batch；重送 request_key 不重複新增。
- 修改前已讀 core-invariants、store-admin-directory、store-shop、points-ledger 與 feature-change-protocol。
- 驗證：權限矩陣、目標資格、版本／配額競態、原子稽核、防重送、圖片失敗及 stale UI；full guard、diff check、Worker dry-run。
- 正式站不寫測試商品、不試贈扣點。資料表可保留，回復上一 Worker／前端即關閉新功能。
- 實作結果：管理員列表 → 代上傳商品 → 核對店名／圖片／售價／分類／銷售方式 → 草稿或上架。樣板／贈點角色不提供入口；每次送出仍由後端驗權。
- 驗證結果：55 項相關測試（含真實 Worker 新路由匿名拒絕）、最終 guard after、git diff --check、Wrangler 4.134.0 deploy --dry-run --keep-vars 全部通過。
- 本機瀏覽器 390px：從真實 StoreShop 掛載的管理員列表進入編輯頁，填寫商品、勾選目標確認、成功存草稿、返回列表件數 0 → 1；使用 localhost 模擬 API，沒有正式資料異動。
- 320px 窄版檢查：工具列補換行，目錄與表單 document scrollWidth 均等於 clientWidth（305px），沒有橫向溢位。測試分頁與本機伺服器已關閉。
- 新增後結果提示自動捲入可見區；網購仍需店家原收款設定。發布順序為套用 0040 → Worker --keep-vars → 推送 GitHub Pages；正式驗證僅查詢 schema、匿名拒絕及靜態檔案版本，不建立商品。
- 發布前重新執行 guard after、diff check、dry-run 全部通過；正式待套 migration 僅 0040。初次 D1 查詢回 7403，帳戶及 Worker 版本交叉核對後重試成功，未變更任何憑證或帳戶設定。
