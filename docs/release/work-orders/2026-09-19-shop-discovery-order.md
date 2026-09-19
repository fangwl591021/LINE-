# 商城隨機推薦與店家業種

- 需求：每次進入商城隨機排列；修正業種篩選。使用者同意測試後直接提交部署。
- 起始／回復 commit：5cbbaf63d6be08bd86ffdc1498ade32e3ef806a3；main；乾淨工作目錄。
- 已讀 core-invariants、store-shop、points-ledger、feature-change-protocol；guard before PASS。
- 允許：商城公開目錄排序、業種篩選與標示、前端快取版本、來源店家分類審核對照、相關測試與契約。
- 不變：管理員排序、商品自身分類、店家上架資格、帳號／歸屬／角色、點數、交易、付款、認領、secrets 與 bindings。
- 排序：每次掛載商城產生 seed；同次搜尋、分類、翻頁沿用 seed；rank + ID 游標跨兩來源分頁。舊客戶端未提供 seed 維持 ID 順序。
- 分類：店家列表依店家 category，不依是否已上架同類商品。42 筆匯入店家依既有介紹人工審核主業種；僅更新本批精確 handle 且尚空白的 category，不覆蓋管理員變更。
- 回復：程式回復起始版本；分類可用本次精確 handle + 預期 category 的反向 SQL，保留其他欄位與歷史。
- 驗證：固定 seed 穩定／不同 seed 順序不同、跨頁不重漏、分類＋搜尋、無商品店家可找到、非法游標 400、完整 guard after、Worker dry-run、正式唯讀驗證。
- 驗證完成：102/102 相關測試；guard before / after PASS；git diff --check PASS；Worker dry-run PASS。初次 after 的測試環境缺 crypto 與舊「店面分類」文字斷言已依新規格補正，再完整執行通過，未放寬身份／點數驗證。
- 本機瀏覽器確認推薦重入換序、目錄同次排序一致、餐飲食品 6 家可篩選；預覽僅記憶體資料庫，沒有交易或正式寫入。
- 分類審核結果：服務 22、食 6、購 11、遊 1、製造 1、行 1；未捏造住宿業者。正式既有 4 家的分類、版本與上架狀態不變。
- 發布目標：line-engine + GitHub Pages；無 migration / secret / binding 變更；分類 SQL 僅 42 精確 handle 的空白 category，以名稱／介紹 CAS 保護。回復 SQL 位於 .wrangler/partner-import-20260919/industry-rollback.sql。
- 部署後需唯讀核對 45 家跨頁不重漏、同 seed 穩定／不同 seed 換序、分類合計 45、舊店家不變及正式資產 hash。正式 release 證據另存 .wrangler/partner-import-20260919。
