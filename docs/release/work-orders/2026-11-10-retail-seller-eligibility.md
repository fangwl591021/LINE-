# 商品上架僅限三類店家

- 需求：取消加入會員即能上架的舊規則，僅扣點店家（redeem／扣點用戶）、雙向店家（store／店長）、總管（admin／總管）可上架商品。
- 基線：main aad80c5。`node tools/run-change-guard.js before` PASS，證據repo外retail-eligibility-before.log。
- 查核：商城本人與管理員代上架、AI草稿及舊路由已依原始角色拒絕不合資格者；前端登入投影會將tenant／租戶顯示成store，存在商品管理入口誤示。只新增由原始RETAIL_ROLES計算的boolean retailSellerEligible；canManage須明確true且本人UID相符，不更動全域normalizeRole或收銀權限。
- 範圍：同步現行契約、教學及商城資格說明/錯誤提示，保留1／20／不限名額、所有權、審核與原子寫入保護。三個載入入口及教學增加sellerEligibility=1快取。
- 禁止：不刪舊店面商品、不改帳號角色、不批次下架、不改點數、訂單或合作方案費用；不發真人訊息或建立正式測試商品。
- 追加查核：真SQLite重現公開registerUser／updateUserProfile能把前端自動附上的role帶入寫入，user可變store且新資格為true；一般資料upsert亦可能將原始tenant轉成store。本次必須封住自行授權來源，普通upsert新建固定user、更新以資料庫當下原始role原子保留，回應使用savedRow真角色。dispatcher移除頂層/data/profile的role別名，這兩個資料儲存在D1失敗時明確失敗，不交給未知舊GAS角色寫入；不新增註冊登入要求。合法管理員updateUserRole、付款、推薦人與註冊獎勵沿原流程，不做資料清理或角色批改。第一輪完整after PASS亦作為此追加修正前基線。
- 已讀：store-cooperation-plans、store-shop、reward-applications的明確CRM方案操作、core-invariants、feature-change-protocol、line-release-verification、Workers/wrangler技能。不改schema或設定。
- 目標驗證：新資格及SQLite越權62項、原商城及管理員代操作96項、前端導航/入口39項、既有收銀/名片VM71項、教學11項PASS。VM僅補真實共享import；教學保留全部原media fingerprint，僅允許新資格文字前後綴。
- 瀏覽器：320/390/1280版型與觸控、7組拒絕（含normalized tenant、缺欄位、string true與帳號不符，privateSellerReads=0）、store/redeem/admin三類允許，以及原點數/QR/買家/店家操作全PASS；正式外連與API寫入0。
- 追加角色邊界：public-profile-role-boundary 34項PASS，含各層role別名忽略、17類原始角色、7種偽造新會員授權、並發管理員調整保留、D1失敗不走GAS，以及受保護方案授予後正常本人資料保存。未改既有updateUserProfile的self ownership或支付流程。
- 完整驗證：最終 `node tools/run-change-guard.js after` PASS（repo外retail-eligibility-after-final.log），所有既有保護維持；語意及差異覆核無阻擋。
- 發布驗證：Wrangler4.155.0最終dry-run PASS；正式before 1f78a9e1-733a-4628-a351-985a1ed6874b、D1/KV/R2綁定及三條cron已只讀保存repo外；10個本地vars與正式相同，另1個Dashboard var以keep-vars保留。部署後bundle雜湊、執行設定/綁定、cron與Pages檔案讀回證據留repo外。測試不代表真人LINE／交易驗收。
