# 探索好店與店家工作台參考版型

- 需求：使用者暫停上架審核續作，改依兩張提供參考圖替換探索好店與店家工作台。
- 基線：main 51a8c54；完整guard:before PASS（repo外listing-evidence-before.log）。
- 範圍：商城兩個指定畫面的呈現、既有入口、必要快取與相應契約/測試；不改Worker、角色資格、點數帳本、上架審核、商品內容、交易、會員資料或LINE行為。
- 探索：綠色主視覺、本人真實點數/QR、三快捷、搜尋/原分類、全部/地區文字搜尋/真實新上架/本機收藏、真實店家卡與底部導覽。沒有距離/精選/全站總數/折抵比例時不虛構；本頁排序明示範圍。
- 店家：依真角色顯示合作方案與贈/扣權限；讀本人既有店面/商品數和成功商品QR月折抵統計，無日期不捏造到期；客戶聯絡人只走原本人名片CRM，非全站商城會員。教學/設定/訂單沿既有入口。
- 必讀：DESIGN、store-shop、store-cooperation-plans、core-invariants、feature-change-protocol、line-release-verification。
- 修改：兩個呈現模組與三份隔離CSS、商城整合及三個入口快取；同步DESIGN、商城契約與受影響的呈現測試。贈點單位、公司商品上架及跨店找商品仍有明確入口。Worker與後端檔案未修改。
- 驗證：完整 `node tools/run-change-guard.js after` PASS（repo外shop-reference-guard-after.log）；新版呈現12項、舊入口/分類/照片/方案/贈點測試通過。舊結構斷言依已核准版型更新，身份、所有權、商品圖片完整與交易保護保留。
- 瀏覽器：`node test/browser/shop-reference-layout.mjs` PASS。320/390/1280兩頁無橫向溢出，兩欄卡片與圖片完整、各可見按鈕至少44px，原外層導覽隱藏並可恢復。一般/贈點/扣點/店長/管理員、真0/載入失敗、搜尋分類新上架收藏排序、QR/訂單/商品管理/交易明細/教學/本人聯絡人與帳號切換遲到回應均通過。productionRequests=0、apiWrites=0；截圖與log留repo外。
- 限制：合成瀏覽器驗證不代表真人LINE手機或正式贈扣點驗收。會員數/導客數/到期日未有資料來源，改用明確標示的商品數與成功商品QR月折抵摘要；無資料顯示尚無資料。
