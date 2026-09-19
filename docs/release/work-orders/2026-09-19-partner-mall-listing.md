# 無帳號合作店家上架點數通商城

- 使用者授權：來源為 aiwe.cc 的 shop_id=78 折抵店家清單；資料完整即正式上架，不標示樣板；同意管理員代建、日後核對認領、匯入後直接部署。
- 起始／回復 commit：39ef95f307258a0c34470f225f103ac4734d27d5；main；起始工作目錄乾淨。
- 修改前完整 guard PASS。
- 已讀：core-invariants、points-ledger、store-shop、store-admin-directory、feature-change-protocol、Cloudflare / D1 / Workers best practices / Wrangler 指引。
- 最小方案：沿用 point_redemption_partners 與既有合作店家管理，將完整的 active 合作店家投影到商城公開目錄。帳號型店面與合作店家仍分離，無虛構 owner、無自動認領、無身份或角色寫入。
- 完整資料：店名、非預設佔位介紹、有效封面、至少電話、LINE 或店家網站聯絡方式；來源有地址／營業時間則保留，缺值不杜撰。
- 允許：目錄唯讀合併、店家介紹聯絡入口、管理員目錄與既有管理頁導引、公開來源資料蒐集／審核／冪等匯入工具、測試、快取版本及契約。
- 禁止：更改用戶／LINE 身份、角色、歸屬、名片、點數／簽到、收銀、付款、訂單、合約狀態、secrets。不得以名稱或電話自動認領。
- 正式寫入只限本批核准合作店家與聯絡據點；保留既有資料，來源重複或與既有店家相符者略過待核對。政策全部不自動開通點數折抵。
- 回復方式：必要時只將本批新建的 partner_handle 改為 hidden，不刪除歷史；程式可回復起始 commit，無新 schema 依賴。
- 來源北／中／南／東共 50 筆；基本檢查後 44 筆，再排除與既有店家電話／公司重複待確認的 2 筆，本批核准 42 筆。現有帳號型店家 4 筆、partners 0 筆（正式唯讀核對）。
- 暫緩 8 筆：685 預設電話；898 與既有米樂公司關係待確認；1273／2695／9826 範本文字；2097 通用名片宣傳而非店家介紹；2297 泛用店名；2382 電話與生活倉庫相同。未做帳號合併或歸屬推定。
- 已驗證：81/81 商城／管理員／匯入相關測試；guard after PASS（含新 bridge 測試）；git diff --check PASS；Worker dry-run PASS。正式 migration list 無待套用項目。
- 本機瀏覽器：記憶體資料庫載入審核後 SQL，商城首頁推薦店家可進入介紹頁，封面、電話／LINE／地圖入口可見；沒有商品結帳入口或收銀提示。未呼叫電話／LINE 聯絡，也未執行交易。
- Worker 回復版本：87f3eae7-c13c-44b1-bdba-d3fbc917d035。匯入／rollback 精確 SQL 與來源審核清單存 .wrangler/partner-import-20260919（不提交聯絡名冊）。
- 發布：Worker → GitHub Pages → 本批 SQL 匯入 → 唯讀核對列表／詳情／分頁及既有 4 家不變。
